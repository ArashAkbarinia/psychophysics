# app.py
from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import json
import random
import csv
import numpy as np
from PIL import Image
import io
import base64

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'static/uploads'
RESULTS_FOLDER = 'results'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)


# Function to convert RGB tuple to hex
def rgb_to_hex(rgb):
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}".upper()


# Updated color palette with RGB tuples and automatically computed hex values
COLORS = [
    {"name": "Red", "rgb": (255, 0, 0)},
    {"name": "Green", "rgb": (0, 255, 0)},
    {"name": "Blue", "rgb": (0, 0, 255)},
    {"name": "Yellow", "rgb": (255, 255, 0)},
    {"name": "Purple", "rgb": (121, 58, 144)},

    {"name": "Brown", "rgb": (113, 69, 41)},
    {"name": "Pink", "rgb": (225, 118, 178)},
    {"name": "Orange", "rgb": (255, 128, 0)},
    {"name": "Turquoise", "rgb": (63, 185, 177)},
    {"name": "Beige", "rgb": (195, 168, 126)},

    {"name": "White", "rgb": (255, 255, 255)},
    {"name": "Black", "rgb": (0, 0, 0)},
    {"name": "Gray", "rgb": (128, 128, 128)},
    # {"name": "Beige", "rgb": (195, 168, 126)},
    # {"name": "Olive", "rgb": (112, 115, 55)},
    # {"name": "Turquoise", "rgb": (63, 185, 177)},
    # {"name": "Khaki", "rgb": (240, 230, 140)},
    # {"name": "Magenta", "rgb": (179, 55, 151)},
    # {"name": "Lime", "rgb": (155, 216, 97)},
    # {"name": "Blue", "rgb": (120, 178, 218)},
]

# Automatically compute hex values for each color
for color in COLORS:
    color["hex"] = rgb_to_hex(color["rgb"])


# Routes
@app.route('/')
def index():
    return render_template('index.html', colors=COLORS)


@app.route('/setup', methods=['POST'])
def setup():
    participant_id = request.form.get('participant_id', 'anonymous')
    results_file = os.path.join(RESULTS_FOLDER, f'{participant_id}_results.csv')

    if not os.path.exists(results_file):
        with open(results_file, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['image_name', 'folder', 'segmentation_label', 'selected_colors'])

    base_path = UPLOAD_FOLDER
    folders = {
        "trial": os.path.join(base_path, "trial"),
        "test": os.path.join(base_path, "test"),
        "train": os.path.join(base_path, "train")
    }

    # Check all required folders exist
    for folder in folders.values():
        if not os.path.exists(folder):
            return jsonify({"error": f"Required image folder '{folder}' not found."}), 400

    # Get images
    get_images = lambda path: [f for f in os.listdir(path) if f.endswith(('.png', '.jpg', '.jpeg'))]

    trial_imgs = get_images(folders["trial"])
    test_imgs = get_images(folders["test"])
    train_imgs = get_images(folders["train"])

    # Random selection and shuffling
    random.shuffle(trial_imgs)
    random.shuffle(test_imgs)
    random.shuffle(train_imgs)

    selected_trial_imgs = trial_imgs[:5]
    selected_test_imgs = test_imgs[:200]
    selected_train_imgs = train_imgs[:400]

    # Add folder info as prefix to image name to differentiate source
    trials = [f"trial/{img}" for img in selected_trial_imgs] + \
             [f"test/{img}" for img in selected_test_imgs] + \
             [f"train/{img}" for img in selected_train_imgs]

    random.shuffle(trials[5:])  # Shuffle only the main trials (keep trial phase first)

    return jsonify({
        "participant_id": participant_id,
        "trials": trials,
        "total_trials": len(trials)
    })


@app.route('/get_trial', methods=['POST'])
def get_trial():
    data = request.json
    image_path = data.get('image_name')  # e.g. "train/image123.jpg"

    full_path = os.path.join(UPLOAD_FOLDER, image_path)

    if not os.path.exists(full_path):
        return jsonify({"error": f"Image not found: {image_path}"}), 404

    seg_img = np.array(Image.open(full_path))
    selected_label = 0
    binary_mask = np.zeros(seg_img.shape[:2]).astype(np.uint8) + 128
    binary_img = Image.fromarray(binary_mask)

    # Convert RGB to base64
    buffered_rgb = io.BytesIO()
    Image.open(full_path).save(buffered_rgb, format="PNG")
    rgb_base64 = base64.b64encode(buffered_rgb.getvalue()).decode('utf-8')

    # Convert binary to base64
    buffered_binary = io.BytesIO()
    binary_img.save(buffered_binary, format="PNG")
    binary_base64 = base64.b64encode(buffered_binary.getvalue()).decode('utf-8')

    return jsonify({
        "rgb_image": rgb_base64,
        "binary_image": binary_base64,
        "image_name": image_path,
        "segmentation_label": int(selected_label)
    })


@app.route('/save_result', methods=['POST'])
def save_result():
    data = request.json
    participant_id = data.get('participant_id', 'anonymous')
    image_path = data.get('image_name')  # e.g. "train/image123.jpg"
    folder, image_name = os.path.split(image_path)
    segmentation_label = data.get('segmentation_label')
    selected_colors = data.get('selected_colors', [])  # Now accepting a list of colors

    # Join multiple colors with a pipe separator for CSV storage
    colors_string = "|".join(selected_colors)

    results_file = os.path.join(RESULTS_FOLDER, f'{participant_id}_results.csv')

    with open(results_file, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([image_name, folder, segmentation_label, colors_string])

    return jsonify({"success": True})


@app.route('/upload', methods=['GET', 'POST'])
def upload():
    if request.method == 'POST':
        # Check if folders exist
        rgb_folder = os.path.join(UPLOAD_FOLDER, 'rgb')
        seg_folder = os.path.join(UPLOAD_FOLDER, 'segmentation')
        os.makedirs(rgb_folder, exist_ok=True)
        os.makedirs(seg_folder, exist_ok=True)

        # Get files
        rgb_files = request.files.getlist('rgb_images')
        seg_files = request.files.getlist('seg_images')

        # Save RGB images
        for file in rgb_files:
            if file.filename:
                file.save(os.path.join(rgb_folder, file.filename))

        # Save segmentation images
        for file in seg_files:
            if file.filename:
                file.save(os.path.join(seg_folder, file.filename))

        return jsonify({"success": True, "message": "Files uploaded successfully"})

    return render_template('upload.html')


if __name__ == '__main__':
    app.run(debug=True)
