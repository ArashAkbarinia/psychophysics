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
    # Create results file if it doesn't exist
    participant_id = request.form.get('participant_id', 'anonymous')
    results_file = os.path.join(RESULTS_FOLDER, f'{participant_id}_results.csv')

    if not os.path.exists(results_file):
        with open(results_file, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['image_name', 'segmentation_label', 'selected_colors'])

    # Get all image pairs
    rgb_folder = os.path.join(UPLOAD_FOLDER, 'rgb')
    # seg_folder = os.path.join(UPLOAD_FOLDER, 'segmentation')
    seg_folder = rgb_folder

    if not os.path.exists(rgb_folder) or not os.path.exists(seg_folder):
        return jsonify({"error": "Image folders not found. Please upload images first."}), 400

    rgb_images = [f for f in os.listdir(rgb_folder) if f.endswith(('.png', '.jpg', '.jpeg'))]

    # Prepare trial list (200 trials or less if fewer images)
    trials = []
    while len(trials) < 200 and rgb_images:
        random.shuffle(rgb_images)
        trials.extend(rgb_images[:min(len(rgb_images), 200 - len(trials))])
        print(trials)

    return jsonify({
        "participant_id": participant_id,
        "trials": trials,
        "total_trials": len(trials)
    })


@app.route('/get_trial', methods=['POST'])
def get_trial():
    data = request.json
    image_name = data.get('image_name')

    rgb_path = os.path.join(UPLOAD_FOLDER, 'rgb', image_name)
    seg_path = rgb_path
    # seg_path = os.path.join(UPLOAD_FOLDER, 'segmentation',
    #                         image_name.replace('.jpg', '.png').replace('.jpeg', '.png'))

    if not os.path.exists(rgb_path) or not os.path.exists(seg_path):
        return jsonify({"error": "Image not found"}), 404

    # Load segmentation image
    seg_img = np.array(Image.open(seg_path))
    # unique_labels = np.unique(seg_img)
    #
    # # Remove background (usually 0)
    # if 0 in unique_labels and len(unique_labels) > 1:
    #     unique_labels = unique_labels[unique_labels != 0]
    #
    # # Randomly select a segment
    # selected_label = random.choice(unique_labels)
    #
    # # Create binary mask
    # binary_mask = (seg_img == selected_label).astype(np.uint8) * 255
    selected_label = 0
    binary_mask = np.zeros(seg_img.shape[:2]).astype(np.uint8) + 128
    binary_img = Image.fromarray(binary_mask)

    # Convert images to base64 for sending to frontend
    buffered_rgb = io.BytesIO()
    Image.open(rgb_path).save(buffered_rgb, format="PNG")
    rgb_base64 = base64.b64encode(buffered_rgb.getvalue()).decode('utf-8')

    buffered_binary = io.BytesIO()
    binary_img.save(buffered_binary, format="PNG")
    binary_base64 = base64.b64encode(buffered_binary.getvalue()).decode('utf-8')

    return jsonify({
        "rgb_image": rgb_base64,
        "binary_image": binary_base64,
        "image_name": image_name,
        "segmentation_label": int(selected_label)
    })


@app.route('/save_result', methods=['POST'])
def save_result():
    data = request.json
    participant_id = data.get('participant_id', 'anonymous')
    image_name = data.get('image_name')
    segmentation_label = data.get('segmentation_label')
    selected_colors = data.get('selected_colors', [])  # Now accepting a list of colors

    # Join multiple colors with a pipe separator for CSV storage
    colors_string = "|".join(selected_colors)

    results_file = os.path.join(RESULTS_FOLDER, f'{participant_id}_results.csv')

    with open(results_file, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([image_name, segmentation_label, colors_string])

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
