document.getElementById('detectButton').addEventListener('click', async () => {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = 'Analyzing first 4 images...';
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
            // Inject content script first to ensure it's loaded
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Then send message
            chrome.tabs.sendMessage(tab.id, { action: 'detect' }, (response) => {
                if (chrome.runtime.lastError) {
                    statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
                    return;
                }
                if (response && response.status === 'completed') {
                    statusDiv.textContent = `Completed! Processed ${response.processed} images`;
                }
            });
        } else {
            statusDiv.textContent = 'Cannot run on this page';
        }
    } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        console.error(error);
    }
});

// New code for image upload
document.getElementById('uploadButton').addEventListener('click', () => {
    document.getElementById('imageUpload').click();
});

document.getElementById('imageUpload').addEventListener('change', async (event) => {
    const statusDiv = document.getElementById('status');
    const resultDiv = document.getElementById('result');
    const classificationDiv = document.getElementById('classification');
    const detailsDiv = document.getElementById('details');

    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        statusDiv.textContent = 'Error: Please select an image file';
        return;
    }

    statusDiv.textContent = 'Analyzing image...';
    resultDiv.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('http://localhost:5000/detect', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        
        // Display results
        resultDiv.style.display = 'block';
        classificationDiv.textContent = data.classification;
        
        if (data.details) {
            detailsDiv.innerHTML = `
                Digital Art: ${data.details.digital_art.toFixed(1)}%<br>
                Synthetic: ${data.details.synthetic.toFixed(1)}%<br>
                Artificial: ${data.details.artificial.toFixed(1)}%<br>
                CG: ${data.details.cg.toFixed(1)}%
            `;
        }

        statusDiv.textContent = 'Analysis complete!';

    } catch (error) {
        statusDiv.textContent = 'Error: ' + error.message;
        resultDiv.style.display = 'none';
        console.error('Error:', error);
    }
}); 