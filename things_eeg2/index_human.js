// Color definitions
const COLORS = [
    {"name": "Red", "rgb": [255, 0, 0]},
    {"name": "Green", "rgb": [0, 255, 0]},
    {"name": "Blue", "rgb": [0, 0, 255]},
    {"name": "Yellow", "rgb": [255, 255, 0]},
    {"name": "Purple", "rgb": [121, 58, 144]},
    {"name": "Brown", "rgb": [113, 69, 41]},
    {"name": "Pink", "rgb": [225, 118, 178]},
    {"name": "Orange", "rgb": [255, 128, 0]},
    {"name": "Turquoise", "rgb": [63, 185, 177]},
    {"name": "Beige", "rgb": [195, 168, 126]},
    {"name": "White", "rgb": [255, 255, 255]},
    {"name": "Black", "rgb": [0, 0, 0]},
    {"name": "Gray", "rgb": [128, 128, 128]}
];

// Convert RGB to hex
function rgbToHex(rgb) {
    return "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1).toUpperCase();
}

// Add hex values to colors
COLORS.forEach(color => {
    color.hex = rgbToHex(color.rgb);
});

// Create color grid
function createColorGrid() {
    const colorGrid = document.getElementById('color-grid');
    COLORS.forEach(color => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color-option';
        colorOption.title = color.name;

        const label = document.createElement('label');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox-input';
        checkbox.dataset.color = color.name;
        checkbox.addEventListener('change', handleColorSelection);

        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'color-swatch';
        colorSwatch.style.backgroundColor = color.hex;

        label.appendChild(checkbox);
        label.appendChild(colorSwatch);
        colorOption.appendChild(label);
        colorGrid.appendChild(colorOption);
    });
}

// Load images on page load
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        createColorGrid(),
        preloadImages(),
        loadResponseCounts()
    ]);
});

// Experiment variables
let isDebugMode = false;
let trainUniformDist = false;
let participantId = '';
let trials = [];
let currentTrialIndex = 0;
let totalTrials = 0;
let currentImageName = '';
let isPaused = false;
let canSelectColor = false;
let selectedColors = [];
let displayedTime = 0;
let results = [];
let imageData = {}; // Store preloaded images
let responseCounts = {};  // image_name count for train images
let isProlificParticipant = false; // Track if participant is from Prolific
let responseTimer = null; // For 5-second response timer
let timerBarAnimation = null; // For timer bar animation
let screeningFailures = 0; // For screening 

// DOM elements
const setupForm = document.getElementById('setup-form');
const experimentContainer = document.getElementById('experiment-container');
const fixation = document.getElementById('fixation');
const displayImage = document.getElementById('display-image');
const currentTrialSpan = document.getElementById('current-trial');
const totalTrialsSpan = document.getElementById('total-trials');
const pauseBtn = document.getElementById('pause-btn');
const continueBtn = document.getElementById('continue-btn');
const finishBtn = document.getElementById('finish-btn');
const completionMessage = document.getElementById('completion-message');
const nextBtn = document.getElementById('next-btn');
const timerBar = document.getElementById('timer-bar');

// Setup event listeners
document.getElementById('start-btn').addEventListener('click', startExperiment);
pauseBtn.addEventListener('click', pauseExperiment);
continueBtn.addEventListener('click', continueExperiment);
finishBtn.addEventListener('click', finishExperiment);
nextBtn.addEventListener('click', handleNextTrial);

// Preload images
async function preloadImages() {
    try {
        const response = await fetch('images.json');
        if (!response.ok) {
            throw new Error('Failed to load image data');
        }
        imageData = await response.json();
        console.log('Images preloaded successfully');
    } catch (error) {
        console.error('Error preloading images:', error);
        alert('Failed to load experiment images. Please refresh the page and try again.');
    }
}

async function loadResponseCounts() {
    try {
        const response = await fetch('static/response_count.csv');
        const text = await response.text();
        const lines = text.trim().split('\n');

        for (let i = 1; i < lines.length; i++) {  // skip header
            const [imageName, countStr] = lines[i].split(',');
            responseCounts[imageName.trim()] = parseInt(countStr.trim(), 10);
        }
        console.log('Response counts loaded');
    } catch (error) {
        console.error('Failed to load response counts:', error);
    }
}

// Start experiment
function startExperiment() {
    const urlParams = new URLSearchParams(window.location.search);
    const hasProlificId = urlParams.has('PROLIFIC_PID');
    isProlificParticipant = hasProlificId; // Set the global flag

    // Auto-generate participant ID with timestamp if no PROLIFIC_PID
    let baseId = hasProlificId ? urlParams.get('PROLIFIC_PID') : Date.now().toString();

    // Read optional info
    const age = document.getElementById('participant-age').value.trim() || "NA";
    const gender = document.getElementById('participant-gender').value.trim() || "NA";
    const language = document.getElementById('participant-language').value.trim().replace(/\s+/g, '-') || "NA";

    // Final ID (e.g., 1684421321234_28_M_Spanish)
    participantId = `${baseId}_${age}_${gender}_${language}`;
    console.log("Participant ID", participantId);

    let num_train_samples;
    let num_test_samples;

    if (isDebugMode) {
        num_train_samples = 5;
        num_test_samples = 5;
    } else {
        num_train_samples = hasProlificId ? 400 : 200;
        num_test_samples = hasProlificId ? 50 : 200;
    }

    try {
        // Use practice trials as-is
        const practiceTrials = [...imageData.trial].slice(0, 2);;

        // Screening trials - use first 5 catch trials
        const screeningTrials = [...imageData.catch].slice(0, 5).map(trial => ({
            ...trial,
            isScreeningTrial: true
        }));

        // 1. Sample train images
        const trainImages = [...imageData.train];
        let sampledTrain = [];
        
        if (trainUniformDist) {
            // For Prolific participants - use uniform distribution
            console.log("Using uniform distribution for Prolific participant");
            sampledTrain = shuffleArray([...trainImages]).slice(0, num_train_samples);
        } else {
            // For non-Prolific participants - use our custom selection strategy
            console.log("Using priority-based selection strategy");
            
            // Select images with priority to those with no responses or < 3 responses
            let remainingToSelect = num_train_samples;
            
            // First, identify eligible images (no responses or < 3)
            const eligibleImages = trainImages.filter(img => {
                const imgName = img.name.split("/").pop(); // get the image filename
                return !(imgName in responseCounts) || responseCounts[imgName] < 3;
            });
            
            console.log(`Found ${eligibleImages.length} eligible images with < 3 responses`);
            
            // Take as many eligible images as needed or available
            if (eligibleImages.length > 0) {
                // Shuffle eligible images for random selection
                const shuffledEligible = shuffleArray([...eligibleImages]);
                const numToTake = Math.min(remainingToSelect, shuffledEligible.length);
                sampledTrain = shuffledEligible.slice(0, numToTake);
                remainingToSelect -= numToTake;
            }
            
            // If we still need more, use weighted random sampling for the rest
            if (remainingToSelect > 0) {
                console.log(`Need ${remainingToSelect} more images, using weighted sampling`);
                
                // Remove already selected images from the pool
                const remainingImages = trainImages.filter(img => 
                    !sampledTrain.some(selected => selected.name === img.name)
                );
                
                // Create weights based on responseCounts
                const weights = remainingImages.map(img => {
                    const imgName = img.name.split("/").pop();
                    const count = responseCounts[imgName] || 0;
                    return 1 / (1 + count);
                });
                
                // Normalize weights
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                const probabilities = weights.map(w => w / totalWeight);
                
                // Sample the remaining needed images
                const additionalImages = weightedRandomSample(remainingImages, probabilities, remainingToSelect);

                
                // Add them to our sample
                sampledTrain = [...sampledTrain, ...additionalImages];
            }
        }

        // 2. Shuffle test and fun
        const shuffledTest = shuffleArray([...imageData.test]).slice(0, num_test_samples);
        const shuffledFun = shuffleArray([...imageData.fun]);

        // 3. Combine and shuffle the full experiment block (excluding practice)
        const experimentBlock = shuffleArray([...sampledTrain, ...shuffledTest, ...shuffledFun]);

        // 4. Insert catch trials every 20 trials
        const catchTrials = [...imageData.catch];

        // If we don't have enough catch trials, cycle through them
        const finalExperimentBlock = [];

        // Calculate how many catch trials we need (one every 20 trials)
        const totalNeeded = Math.floor(experimentBlock.length / 20);

        for (let i = 0; i < experimentBlock.length; i++) {
            finalExperimentBlock.push(experimentBlock[i]);

            // Insert a catch trial after every 20 regular trials
            if ((i + 1) % 20 === 0 && i < experimentBlock.length - 1) {
                // Get catch trial index - cycle through them if needed
                const catchIndex = Math.floor(i / 20) % catchTrials.length;
                // Mark this as a catch trial
                const catchTrial = {...catchTrials[catchIndex], isCatchTrial: true};
                finalExperimentBlock.push(catchTrial);
            }
        }

        // 5. Combine practice + screening + experiment with catch trials
        trials = [...practiceTrials, ...screeningTrials, ...finalExperimentBlock];
        totalTrials = trials.length;
        currentTrialIndex = 0;
        screeningFailures = 0; // Initialise screening failures counter

        // Update UI
        setupForm.classList.add('hidden');
        document.getElementById('experiment-title').classList.add('hidden');
        experimentContainer.classList.remove('hidden');

        // Show pause button only for non-Prolific participants
        if (!isProlificParticipant) {
            pauseBtn.classList.remove('hidden');
        } else {
            pauseBtn.classList.add('hidden');
            pauseBtn.disabled = true; // Also disable it to be safe
        }

        totalTrialsSpan.textContent = totalTrials;
        currentTrialSpan.textContent = '1';

        // Start the first trial
        runTrial();
    } catch (error) {
        console.error('Error setting up experiment:', error);
        alert('Failed to start experiment. Please try again.');
    }
}

// If you still want to keep the selectTrainImage function for potential future use:
function selectTrainImage(trainImages, responseCounts) {
    // Filter images that have no responses or fewer than 3
    const eligibleImages = trainImages.filter(img => {
        const imgName = img.name.split("/").pop(); // get the image filename
        return !(imgName in responseCounts) || responseCounts[imgName] < 3;
    });

    if (eligibleImages.length > 0) {
        // Randomly sample from eligible images
        const index = Math.floor(Math.random() * eligibleImages.length);
        return eligibleImages[index];
    } else {
        // Create weights based on responseCounts for remaining images
        const weights = trainImages.map(img => {
            const imgName = img.name.split("/").pop();
            const count = responseCounts[imgName] || 0;
            return 1 / (1 + count);
        });
        
        // Use weighted random sampling
        return weightedRandomSample(trainImages, weights, 1)[0];
    }
}

// Shuffle array in place using Fisher-Yates algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function createGrayImage(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgb(128,128,128)'; // Mid-grey
    ctx.fillRect(0, 0, width, height);

    return canvas.toDataURL();
}

// More accurate image show using requestAnimationFrame
function showImagePrecise(imgElement, durationMs = 100) {
    return new Promise(resolve => {
        const start = performance.now();
        imgElement.classList.remove('hidden');

        function loop() {
            const now = performance.now();
            if (now - start >= durationMs) {
                imgElement.classList.add('hidden');
                resolve(now - start);  // Actual shown time
            } else {
                requestAnimationFrame(loop);
            }
        }
        loop();
    });
}

// Preload image, decode, then assign to DOM image only after ready and next frame
function preloadAndDisplayImage(url, imgElement) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            img.decode()
                .then(() => {
                    imgElement.src = img.src;
                    requestAnimationFrame(() => resolve()); // Ensure next frame
                })
                .catch(reject);
        };
        img.onerror = reject;
        img.src = url;
    });
}

// Start 5 second response timer with animation
function startResponseTimer() {
    // Clear any existing timer
    clearResponseTimer();
    
    // Set up timer bar animation
    timerBar.style.width = '100%';
    timerBar.style.transition = 'width 5s linear';
    
    // Trigger reflow to ensure the animation starts correctly
    timerBar.getBoundingClientRect();
    
    // Start animation
    timerBar.style.width = '0%';
    
    // Set 5 second timer for auto-next
    responseTimer = setTimeout(() => {
        handleTimeExpired();
    }, 5000);
}

// Clear response timer
function clearResponseTimer() {
    clearTimeout(responseTimer);
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
}

// Handle timer expiration - no selection made
function handleTimeExpired() {
    if (canSelectColor) {
        console.log("Time expired for trial:", currentTrialIndex);
        
        // Add current trial to the pending retrials list
        const currentTrial = trials[currentTrialIndex];
        // pendingRetrials.push(currentTrial);
        
        // Move to next trial automatically
        handleNextTrial(true);
    }
}

// Run a single trial
async function runTrial() {
    if (currentTrialIndex >= totalTrials) {
        completeExperiment();
        return;
    }

    // Show practice message for the first 2 trials
    const practiceMessage = document.getElementById('practice-message');
    if (currentTrialIndex < 2) {
        practiceMessage.classList.remove('hidden');
    } else {
        practiceMessage.classList.add('hidden');
    }

    if (isPaused) {
        return;
    }

    // Reset color selection state
    canSelectColor = false;
    resetColorSelection();

    const currentTrial = trials[currentTrialIndex];

    // Show fixation, hide image
    displayImage.classList.add('hidden');
    fixation.classList.remove('hidden');

    // Wait for 500ms showing fixation
    await new Promise(resolve => setTimeout(resolve, 500));

    // Hide fixation
    fixation.classList.add('hidden');

    try {
        // Store current trial info
        currentImageName = currentTrial.name;

        // Prepare to show RGB image
        await preloadAndDisplayImage(currentTrial.rgb, displayImage);
        displayedTime = await showImagePrecise(displayImage, 100);
        console.log("Displayed time:", displayedTime)

        // Now replace with gray mask
        const grayImageDataUrl = await createGrayImage(displayImage.width, displayImage.height);
        displayImage.src = grayImageDataUrl;

        // Now allow color selection and start response timer
        canSelectColor = true;
        startResponseTimer();
    } catch (error) {
        console.error('Error running trial:', error);
        alert('Failed to run trial. Please try again.');
    }
}

// Handle color selection
function handleColorSelection(event) {
    if (isPaused || !canSelectColor) {
        event.preventDefault();
        return;
    }

    const checkbox = event.target;
    const selectedColor = checkbox.dataset.color;

    if (!selectedColor) {
        return;
    }

    // Update selected colors array based on checkbox state
    if (checkbox.checked) {
        // Add color if not already selected
        if (!selectedColors.includes(selectedColor)) {
            selectedColors.push(selectedColor);
        }
    } else {
        // Remove color if unchecked
        selectedColors = selectedColors.filter(color => color !== selectedColor);
    }
}

// Handle next trial button click
async function handleNextTrial(isAutomatic = false) {
    if ((!canSelectColor && !isAutomatic) || isPaused) {
        return;
    }

    // Clear response timer
    clearResponseTimer();

    try {
        const currentTrial = trials[currentTrialIndex];
        const noResponse = selectedColors.length === 0;

        // Handle screening trials (after practice)
        if (currentTrial.isScreeningTrial) {
            const isCorrect = validateCatchTrialResponse(currentTrial, selectedColors);

            if (!isCorrect || noResponse) {
                screeningFailures++;
            }

            if (screeningFailures > 2) {
                // Failed screening - more than 2 errors
                failScreening();
                return;
            }
        }

        // Save results for real trials
        if (currentTrialIndex >= 7 && !noResponse) {
            const result = {
                participant_id: participantId,
                image_name: currentImageName.split("/")[1],
                folder: currentImageName.split("/")[0],
                selected_colors: [...selectedColors],
                displayed_time: displayedTime
            };
            results.push(result);
            if (!isDebugMode) uploadResultToGoogleForm(result);
        }

        // If no response, add current trial at the end
        if (currentTrialIndex >= 7 && noResponse) {
            console.log("No response, adding trial to end:", currentImageName);
            // Push the current trial to the end
            trials.push(trials[currentTrialIndex]);
            // Remove the current trial from current position
            trials.splice(currentTrialIndex, 1);
        } else {
            currentTrialIndex++;
            currentTrialSpan.textContent = currentTrialIndex + 1;
        }

        canSelectColor = false;
        displayImage.src = ''; // Clear image
        runTrial();
    } catch (error) {
        console.error('Error handling next trial:', error);
        alert('Failed to proceed to next trial. Please try again.');
    }
}

// Function to validate catch trial responses
function validateCatchTrialResponse(trial, selectedColors) {
    // Extract the color name from the filename
    const imageName = trial.name.split("/").pop(); // e.g. "Red.png"
    const expectedColor = imageName.split(".")[0]; // e.g. "Red"

    // Check if the expected color is in the selected colors
    const hasExpectedColor = selectedColors.includes(expectedColor);

    // If they selected the right color plus potentially Black, it's fine
    // If they selected other colors, it's incorrect
    if (hasExpectedColor) {
        if (selectedColors.length === 1) {
            return true; // Only selected the expected color
        } else if (selectedColors.length === 2 && selectedColors.includes("Black")) {
            return true; // Selected expected color + Black
        } else {
            return false; // Selected expected color + other colors
        }
    } else {
        return false; // Didn't select the expected color
    }
}

// Function to handle screening failure
function failScreening() {
    experimentContainer.classList.add('hidden');
    document.getElementById('screening-failed-message').classList.remove('hidden');
    console.log(`Screening failed: ${screeningFailures} errors out of 5 trials`);

    // Redirect Prolific users after a short delay
    if (isProlificParticipant) {
        setTimeout(() => {
            window.location.href = 'https://app.prolific.com/submissions/complete?cc=CIFCGT5C';
        }, 2000); // 2-second delay so the thank-you message is briefly shown
    }
}

// Reset color selection
function resetColorSelection() {
    selectedColors = [];
    document.querySelectorAll('.checkbox-input').forEach(checkbox => {
        checkbox.checked = false;
    });
}

// Pause experiment
function pauseExperiment() {
    // Don't allow Prolific participants to pause
    if (isProlificParticipant) {
        return;
    }

    isPaused = true;
    pauseBtn.classList.add('hidden');
    continueBtn.classList.remove('hidden');
    finishBtn.classList.remove('hidden');
}

// Continue experiment
function continueExperiment() {
    isPaused = false;

    // Only show pause button for non-Prolific participants
    if (!isProlificParticipant) {
        pauseBtn.classList.remove('hidden');
    }

    continueBtn.classList.add('hidden');
    finishBtn.classList.add('hidden');
    runTrial();
}

// Finish experiment early
function finishExperiment() {
    if (confirm('Are you sure you want to finish the experiment early?')) {
        completeExperiment();
    }
}

// Complete experiment
function completeExperiment() {
    experimentContainer.classList.add('hidden');
    completionMessage.classList.remove('hidden');

    // Redirect Prolific users after a short delay
    if (isProlificParticipant) {
        setTimeout(() => {
            window.location.href = 'https://app.prolific.com/submissions/complete?cc=COBSD4MH';
        }, 2000); // 2-second delay so the thank-you message is briefly shown
    }
}

function uploadResultToGoogleForm(result) {
    const formUrl = 'https://docs.google.com/forms/u/0/d/e/1FAIpQLSf9m4mXkDWxSNNWTcyC2O3SZxMAZihM0NYGZkKa7wHsQuZXTg/formResponse';

    const formData = new FormData();
    formData.append('entry.413854961', result.participant_id); // Replace with your actual field
    formData.append('entry.853270788', result.image_name);
    formData.append('entry.687010064', result.folder);
    formData.append('entry.1046117494', result.selected_colors.join('|'));
    formData.append('entry.1979874174', result.displayed_time);

    fetch(formUrl, {
        method: 'POST',
        mode: 'no-cors',  // Required to avoid CORS errors
        body: formData
    }).catch(err => {
        console.error('Upload failed:', err);
    });
}

function showImageForDuration(image, durationMs) {
    return new Promise(resolve => {
        const startTime = performance.now();
        image.classList.remove('hidden');

        function checkTime() {
            const elapsedTime = performance.now() - startTime;
            if (elapsedTime >= durationMs) {
                image.classList.add('hidden');
                resolve();
            } else {
                requestAnimationFrame(checkTime);
            }
        }

        requestAnimationFrame(checkTime);
    });
}

function weightedRandomSample(items, probabilities, sampleSize) {
    const sampled = [];
    const cumulative = [];

    probabilities.reduce((acc, p, i) => {
        cumulative[i] = acc + p;
        return cumulative[i];
    }, 0);

    for (let n = 0; n < sampleSize; n++) {
        const rand = Math.random();
        const idx = cumulative.findIndex(c => c >= rand);
        sampled.push(items[idx]);
    }

    return sampled;
}
