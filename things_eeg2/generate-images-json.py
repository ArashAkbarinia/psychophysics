import os
import json
from glob import glob
import argparse

def generate_images_json(base_folder='static/uploads'):
    """
    Generate an images.json file by scanning images in the base_folder.
    
    Structure expected:
    - base_folder/
      - trial/
      - test/
      - train/
      - fun/
    
    Images should be in pairs, with filenames that match except for a prefix:
    - image1.jpg (RGB image)
    - mask1.jpg (Mask image)
    """
    # Check if base folder exists
    if not os.path.exists(base_folder):
        print(f"Error: Base folder '{base_folder}' does not exist.")
        return False
    
    # Define the categories to scan
    categories = ['trial', 'test', 'train', 'fun']
    result = {}
    
    # Process each category
    for category in categories:
        category_path = os.path.join(base_folder, category)
        if not os.path.exists(category_path):
            print(f"Warning: Category folder '{category_path}' does not exist. Creating empty entry.")
            result[category] = []
            continue
        
        # Get all files that match image file extensions
        image_files = []
        for ext in ['.jpg', '.jpeg', '.png']:
            image_files.extend(glob(os.path.join(category_path, f"*{ext}")))
        
        # Filter out mask files (assuming they start with "mask")
        rgb_files = [f for f in image_files if not os.path.basename(f).lower().startswith('mask')]
        
        # Process the RGB images and find their corresponding masks
        category_data = []
        for img_ind, rgb_file in enumerate(sorted(rgb_files)):
            if img_ind == 5:
                break
            # Get the image filename without extension
            base_name = os.path.basename(rgb_file)
            name_without_ext = os.path.splitext(base_name)[0]

            # Construct potential mask filenames with different extensions
            mask_candidates = []
            for ext in ['.jpg', '.jpeg', '.png']:
                mask_candidates.append(os.path.join(category_path, f"mask{name_without_ext}{ext}"))
                mask_candidates.append(os.path.join(category_path, f"mask_{name_without_ext}{ext}"))

            # Find an existing mask file
            mask_file = None
            for candidate in mask_candidates:
                if os.path.exists(candidate):
                    mask_file = candidate
                    break

            rel_rgb_path = rgb_file.replace('\\', '/')
            if mask_file:
                # Use relative paths for the JSON file
                rel_mask_path = mask_file.replace('\\', '/')

                # Add entry to category data
                category_data.append({
                    "name": f"{category}/{base_name}",
                    "rgb": rel_rgb_path,
                    "mask": rel_mask_path
                })
            else:
                category_data.append({
                    "name": f"{category}/{base_name}",
                    "rgb": rel_rgb_path
                })
                # print(f"Warning: No matching mask file found for {rgb_file}")
        
        result[category] = category_data
        print(f"Added {len(category_data)} image pairs for category '{category}'")
    
    # Write the result to images.json
    with open('images.json', 'w') as f:
        json.dump(result, f, indent=2)
    
    print(f"Successfully generated images.json with {sum(len(data) for data in result.values())} total image pairs")
    return True


def main():
    parser = argparse.ArgumentParser(description='Generate images.json for a static experiment site')
    parser.add_argument('--base-folder', default='static/uploads', 
                        help='Base folder containing trial, test, train, and fun subdirectories')
    args = parser.parse_args()
    
    generate_images_json(args.base_folder)


if __name__ == "__main__":
    main()
