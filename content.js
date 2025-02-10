// Add this at the top of content.js
console.log("Content script loaded");

// Function to add watermark to image
function addWatermark(image, result) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = image.width;
    canvas.height = image.height;
    
    // Draw original image
    ctx.drawImage(image, 0, 0);
    
    // Parse the result string to get classification and score
    const [classification, scoreText] = result.split(' (');
    const score = parseFloat(scoreText);
    
    // Add better looking watermark
    const isAI = classification === 'AI Generated';
    const color = isAI ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 255, 0, 0.8)';
    
    // Add corner ribbon
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 200, 40);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(result, 10, 25);
    
    return canvas.toDataURL();
}

// Update processImage function to handle new response format
async function processImage(imageUrl) {
    try {
        // Create a new image element to load and verify the image
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.crossOrigin = "anonymous";  // Enable CORS
            img.src = imageUrl;
        });

        // Skip small images
        if (img.width < 64 || img.height < 64) {
            console.log(`Skipping small image: ${img.width}x${img.height}`);
            return null;
        }

        // Convert image to blob using canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Get blob from canvas
        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });

        if (!blob || blob.size === 0) {
            console.log('Failed to create valid blob');
            return null;
        }

        return await sendImageToServer(blob);

    } catch (error) {
        console.error('Error processing image:', error);
        return null;
    }
}

async function sendImageToServer(blob) {
    try {
        const formData = new FormData();
        const file = new File([blob], 'image.jpg', { 
            type: 'image/jpeg'
        });
        formData.append('image', file);

        const result = await fetch('http://localhost:5000/detect', {
            method: 'POST',
            mode: 'cors',
            body: formData
        });

        if (!result.ok) {
            const errorData = await result.json();
            console.error('Server error:', errorData);
            return null;
        }

        return await result.json();
    } catch (error) {
        console.error('Server processing error:', error);
        return null;
    }
}

// Function to process images on the page
async function processImages() {
    const images = document.querySelectorAll('img');
    let processed = 0;

    for (const img of images) {
        if (processed >= 4) break;

        try {
            if (img.src && !img.hasAttribute('data-ai-processed')) {
                // Skip small images early
                if (img.width < 64 || img.height < 64) {
                    console.log(`Skipping small image: ${img.width}x${img.height}`);
                    continue;
                }

                const result = await processImage(img.src);
                
                if (result && !result.error) {
                    // Add visual indicator
                    const label = document.createElement('div');
                    label.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: 0;
                        background: ${result.raw_score > 1 ? 'rgba(255,0,0,0.7)' : 'rgba(0,255,0,0.7)'};
                        color: white;
                        padding: 2px 5px;
                        font-size: 12px;
                        z-index: 1000;
                    `;
                    label.textContent = result.classification;
                    
                    if (img.parentElement) {
                        img.parentElement.style.position = 'relative';
                        img.parentElement.appendChild(label);
                    }
                    
                    processed++;
                }
                
                img.setAttribute('data-ai-processed', 'true');
            }
        } catch (error) {
            console.error('Error processing image:', error);
            continue;
        }
    }

    return { status: 'completed', processed };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'detect') {
        processImages().then(sendResponse);
        return true; // Will respond asynchronously
    }
}); 