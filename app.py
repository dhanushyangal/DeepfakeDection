import os
import io
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
tf.compat.v1.enable_v2_behavior()
import tensorflow_hub as hub

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
tf.get_logger().setLevel('ERROR')

app = Flask(__name__)
# Update CORS configuration to be more permissive during development
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST"],
        "allow_headers": ["Content-Type"]
    }
})

# Configuration
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
MODEL_INPUT_SIZE = (224, 224)
MODEL_URL = "https://tfhub.dev/google/imagenet/efficientnet_v2_imagenet21k_ft1k_b0/classification/2"

# Load the model
try:
    model = hub.load(MODEL_URL)
    print("Model loaded successfully")
except Exception as e:
    print(f"Error loading model: {str(e)}")
    model = None

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def preprocess_image(image):
    if image.mode != 'RGB':
        image = image.convert('RGB')
    
    image = image.resize(MODEL_INPUT_SIZE)
    img_array = np.array(image, dtype=np.float32) / 255.0
    img_array = np.expand_dims(img_array, 0)
    return tf.convert_to_tensor(img_array, dtype=tf.float32)

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'running',
        'model_loaded': bool(model)
    })

@app.route('/detect', methods=['POST'])
def detect_image():
    try:
        app.logger.info(f"Request received: {request.files}")
        
        if request.content_length > MAX_FILE_SIZE:
            app.logger.error("File size too large")
            return jsonify({'error': 'File size exceeds 10MB limit'}), 413

        if 'image' not in request.files:
            app.logger.error("No image field in request")
            return jsonify({'error': 'No image provided'}), 400

        file = request.files['image']
        if not file or file.filename == '':
            app.logger.error("Empty file or no filename")
            return jsonify({'error': 'Empty file provided'}), 400

        # Read the file content
        file_content = file.read()
        if not file_content:
            app.logger.error("Empty file content")
            return jsonify({'error': 'Empty file content'}), 400

        # Try to determine image format
        try:
            image = Image.open(io.BytesIO(file_content))
            # Force load image to verify it's valid
            image.load()
            app.logger.info(f"Image format: {image.format}, Size: {image.size}, Mode: {image.mode}")
        except Exception as e:
            app.logger.error(f"Failed to identify image format: {str(e)}")
            return jsonify({'error': 'Invalid image format'}), 400

        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        if image.size[0] < 64 or image.size[1] < 64:
            app.logger.error(f"Image too small: {image.size}")
            return jsonify({'error': 'Image too small'}), 400

        processed_image = preprocess_image(image)
        predictions = model(processed_image)
        scores = tf.nn.softmax(predictions).numpy()
        
        # Calculate scores
        digital_art_score = np.sum(scores[0][914:925]) * 35
        synthetic_score = np.sum(scores[0][970:980]) * 30
        artificial_score = np.sum(scores[0][880:890]) * 20
        cg_score = np.sum(scores[0][500:510]) * 15
        
        total_score = digital_art_score + synthetic_score + artificial_score + cg_score
        classification = 'Real' if total_score < 1 else 'AI Generated'
        
        return jsonify({
            'classification': f'{classification} ({total_score:.1f}%)',
            'raw_score': float(total_score),
            'details': {
                'digital_art': float(digital_art_score),
                'synthetic': float(synthetic_score),
                'artificial': float(artificial_score),
                'cg': float(cg_score)
            }
        })

    except Exception as e:
        app.logger.error(f"Error processing image: {str(e)}")
        return jsonify({'error': f'Error processing image: {str(e)}'}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False) 