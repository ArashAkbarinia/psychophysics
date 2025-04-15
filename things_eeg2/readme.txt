# Online Psychophysical Experiment

This is a web-based psychophysical experiment where participants are shown RGB images briefly, followed by a binary segmentation mask. Their task is to assign a color to the highlighted segment from a predefined set of 30 colors.

## Requirements

- Python 3.6+
- Flask
- Pillow
- NumPy

## Installation

1. Clone this repository:
```
git clone <repository-url>
cd psychophysical-experiment
```

2. Create a virtual environment and install dependencies:
```
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install Flask Pillow numpy
```

## Experiment Setup

1. Run the Flask application:
```
python app.py
```

2. Open your browser and navigate to `http://127.0.0.1:5000/`

3. First, go to the Upload page (link at the bottom of the home page) to upload your RGB images and segmentation maps:
   - RGB images can be JPG or PNG
   - Segmentation maps must be PNG images containing integer labels
   - Make sure each RGB image has a corresponding segmentation map with the same name (but with .png extension)

4. Once your images are uploaded, return to the main page and enter a participant ID to start the experiment

## Experiment Flow

1. The participant sees a fixation cross (+) for 500ms
2. An RGB image is shown for 100ms
3. A binary mask highlighting one segment is displayed
4. The participant selects a color from the 30-color palette
5. The process repeats for 200 trials or until all available images are used

## Data Storage

Results are saved in real-time in the `results` folder as CSV files. Each file is named with the participant's ID and contains:
- Image name
- Segmentation label
- Selected color

## Features

- The experiment can be paused and resumed at any time
- The experiment can be terminated early without data loss
- Progress is shown during the experiment
- Results are saved after each trial

## Deployment

To deploy this application on GitHub Pages or any other static site hosting:

1. Push the code to a GitHub repository
2. Set up GitHub Pages to serve from your repository
3. Configure your server to run the Flask application (for non-GitHub hosting)

For a fully server-free solution, you could modify the code to use browser local storage and then download the results as a CSV at the end.

## License

This project is open source and available under the MIT License.
