// File handling logic
const fileInput = document.getElementById('fileInput');
const fileNameSpan = document.getElementById('fileName');
const clearFileBtn = document.getElementById('clearFileBtn');
const selectedFileDiv = document.querySelector('.selected-file');

fileInput.addEventListener('change', function() {
    const file = fileInput.files[0];
    if (file) {
        fileNameSpan.textContent = file.name;
        selectedFileDiv.style.display = 'flex';
    }
});

clearFileBtn.addEventListener('click', function() {
    fileInput.value = '';
    fileNameSpan.textContent = '';
    selectedFileDiv.style.display = 'none';
});


let lastData = null;

// --- Color Helpers ---
function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(x => x + x).join('');
    }
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    return {r, g, b};
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0; // achromatic
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return {h, s, l};
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255)};
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function lightenColor(hex, percent) {
    let {r, g, b} = hexToRgb(hex);
    let {h, s, l} = rgbToHsl(r, g, b);
    l = Math.min(1, l + percent / 100);
    let {r: r2, g: g2, b: b2} = hslToRgb(h, s, l);
    return rgbToHex(r2, g2, b2);
}

// Automatically compute and update the user bubble color variant
document.addEventListener("DOMContentLoaded", function () {
    let primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
    // Lighten by 50% (adjust as needed)
    let userBubbleColor = lightenColor(primaryColor, 50);
    document.documentElement.style.setProperty('--user-bubble-color', userBubbleColor);
});

// --- Chat App Functionality ---
function appendMessage(message, sender) {
    const chatMessages = document.getElementById("chatMessages");
    // Create a container for alignment
    const container = document.createElement("div");
    container.className = "message-container " + sender;
    // Create the bubble element with the message
    const bubble = document.createElement("div");
    bubble.className = "message-bubble " + sender;
    bubble.innerText = message;
    container.appendChild(bubble);
    chatMessages.appendChild(container);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Modify sendChat to handle file upload
async function sendChat() {
    const chatInput = document.getElementById("chatInput");
    const message = chatInput.value.trim();
    const file = fileInput.files[0];

    if (!message && !file) {
        alert("Please enter a message or upload a file.");
        return;
    }

    // Create FormData
    const formData = new FormData();
    if (message) formData.append("user_input", message);
    if (file) formData.append("file", file);
    
    // Add analysis type if file is present
    if (file) formData.append("analysis_type", "full");

    // Clear inputs
    chatInput.value = '';
    
    // Add visual feedback
    if (file) {
        appendMessage(`[Uploaded file: ${file.name}]`, "user");
    }
    if (message) {
        appendMessage(message, "user");
    }

    try {
        // Use analyze_screenplay endpoint if file is present, otherwise use chat
        const endpoint = file ? '/analyze_screenplay' : '/chat';
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            appendMessage(`Error: ${data.error}`, "bot");
            return;
        }

        // Store the last response data
        lastData = data;

        // Handle the response
        let responseMessage = '';
        if (data.analysis) {
            responseMessage = JSON.stringify(data.analysis, null, 2);
        } else if (data.response) {
            responseMessage = data.response;
        }

        // Append bot response
        appendMessage(responseMessage, "bot");

        // Update JSON panel
        document.getElementById("jsonViewPanel").innerText = JSON.stringify(data, null, 4);
        
        // Show download button
        document.getElementById("downloadJson").style.display = "flex";

    } catch (error) {
        console.error('Error:', error);
        appendMessage("Error processing request", "bot");
    }
}

document.getElementById("sendBtn").addEventListener("click", sendChat);

// Send on Enter key for the textarea (Shift+Enter for newline)
document.getElementById("chatInput").addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
    }
});

// Retry: clear chat history and input
document.getElementById("retryBtn").addEventListener("click", function () {
    document.getElementById("chatInput").value = "";
    document.getElementById("chatMessages").innerHTML = "";
    document.getElementById("jsonViewPanel").innerText = "";
    lastData = null;
    // Hide the download button again
    document.getElementById("downloadJson").style.display = "none";
});

// Toggle the JSON panel open/closed when clicking the bookmark tab
document.getElementById("toggleTab").addEventListener("click", function () {
    const panel = document.getElementById("jsonViewPanel");
    panel.classList.toggle("open");
});

// Download JSON output
document.getElementById("downloadJson").addEventListener("click", function () {
    if (!lastData) {
        alert("No data to download!");
        return;
    }
    fetch('/download_json', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(lastData)
    })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "output.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
        });
});

// Upload PDF
