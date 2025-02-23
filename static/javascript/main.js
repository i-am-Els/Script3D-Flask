// Flash message function
function flash(message, type = 'info') {
    const flashContainer = document.getElementById('flash-messages');
    const flashMessage = document.createElement('div');
    flashMessage.className = `flash-message ${type}`;
    
    // Add icon based on message type
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    flashMessage.appendChild(icon);
    
    const messageText = document.createElement('span');
    messageText.textContent = message;
    flashMessage.appendChild(messageText);
    
    flashContainer.appendChild(flashMessage);
    
    setTimeout(() => flashMessage.remove(), 5000);
}

// File handling functions
function handleFile(file) {
    if (!file) return;
    
    // Check file type
    const allowedTypes = ['.txt', '.pdf', '.fountain'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
        flash('Please upload a .txt, .pdf, or .fountain file', 'error');
        return;
    }
    
    // Update UI to show selected file
    const selectedFileDiv = document.getElementById('selectedFile');
    const fileNameSpan = document.getElementById('fileName');
    fileNameSpan.textContent = file.name;
    selectedFileDiv.style.display = 'flex';
    
    // Clear textarea if it has content
    document.getElementById('chatInput').value = '';
}

// Clear file selection
function clearFileSelection() {
    const fileInput = document.getElementById('fileInput');
    const selectedFileDiv = document.getElementById('selectedFile');
    fileInput.value = '';
    selectedFileDiv.style.display = 'none';
}

// Setup drag and drop handlers
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop zone when dragging over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    const dropZone = document.getElementById('dropZone');
    dropZone.style.borderColor = 'var(--primary-color)';
    dropZone.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
}

function unhighlight(e) {
    const dropZone = document.getElementById('dropZone');
    dropZone.style.borderColor = '';
    dropZone.style.backgroundColor = '';
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    handleFile(file);
}

// Start entity analysis
async function startAnalysis() {
    const chatInput = document.getElementById('chatInput');
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.querySelector('.btn-primary');
    const textContent = chatInput.value.trim();
    const file = fileInput.files[0];

    if (!textContent && !file) {
        flash('Please either upload a file or paste your screenplay text.', 'error');
        return;
    }

    // Show loading state
    const originalContent = analyzeBtn.innerHTML;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    analyzeBtn.disabled = true;

    try {
        const formData = new FormData();
        if (file) {
            formData.append('file', file);
        } else {
            formData.append('text_content', textContent);
        }

        const response = await fetch('/analyze/entities', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log('API Response:', data);

        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        // Display entities
        displayEntities(data.entities);
        flash('Entity analysis completed successfully!', 'success');

        // Show next step options
        showNextSteps(['interaction_analysis']);

    } catch (error) {
        console.error('Error:', error);
        flash('Error processing request', 'error');
    } finally {
        analyzeBtn.innerHTML = originalContent;
        analyzeBtn.disabled = false;
    }
}

// Display entities
function displayEntities(entities) {
    const resultsSection = document.getElementById('results-section');
    const entitiesList = document.getElementById('entities-list');
    
    resultsSection.style.display = 'block';
    entitiesList.innerHTML = '<h3>Identified Entities</h3>';

    if (!entities || Object.keys(entities).length === 0) {
        entitiesList.innerHTML += '<p class="no-entities">No entities found</p>';
        return;
    }

    // Group entities by type
    const groupedEntities = {
        character: [],
        prop: [],
        environment: []
    };

    // Debug log
    console.log('Received entities:', entities);

    Object.entries(entities).forEach(([id, entity]) => {
        if (entity && entity.type && groupedEntities.hasOwnProperty(entity.type)) {
            groupedEntities[entity.type].push({ id, ...entity });
        }
    });

    // Create sections for each type
    Object.entries(groupedEntities).forEach(([type, typeEntities]) => {
        if (typeEntities.length === 0) return;

        const section = document.createElement('div');
        section.className = 'entity-section';
        section.innerHTML = `
            <h4 class="entity-type">
                <i class="fas ${getTypeIcon(type)}"></i>
                ${capitalizeFirstLetter(type)}s (${typeEntities.length})
            </h4>
            <div class="entity-grid">
                ${typeEntities.map(entity => `
                    <div class="entity-card" data-entity-id="${entity.id}">
                        <div class="entity-header">
                            <span class="entity-name">${entity.name}</span>
                            <span class="entity-id">${entity.id}</span>
                            ${entity.is_interactive ? 
                                '<span class="interactive-badge" title="Interactive"><i class="fas fa-hand-pointer"></i></span>' 
                                : ''}
                        </div>
                        <p class="entity-description">${entity.description}</p>
                    </div>
                `).join('')}
            </div>
        `;
        entitiesList.appendChild(section);
    });
}

// Helper functions
function getTypeIcon(type) {
    const icons = {
        character: 'fa-user',
        prop: 'fa-cube',
        environment: 'fa-tree'
    };
    return icons[type] || 'fa-question';
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function toTitleCase(str) {
    return str.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function showNextSteps(steps) {
    // Remove any existing next steps sections
    document.querySelectorAll('.next-steps').forEach(el => el.remove());
    
    // Create next steps for entities tab
    if (steps.includes('interaction_analysis')) {
        const entityNextSteps = createNextStepsElement(['interaction_analysis'], 'entities');
        document.getElementById('entities-list').appendChild(entityNextSteps);
    }
    
    // Create next steps for interactions tab
    if (steps.includes('component_analysis') || steps.includes('timeline')) {
        const interactionNextSteps = createNextStepsElement(
            ['component_analysis', 'timeline'], 
            'interactions'
        );
        document.getElementById('interactions-list').appendChild(interactionNextSteps);
    }
}

function createNextStepsElement(steps, tabId) {
    const nextSteps = document.createElement('div');
    nextSteps.className = 'next-steps';
    nextSteps.setAttribute('data-tab', tabId);
    
    nextSteps.innerHTML = `
        <h3>Next Steps</h3>
        <div class="steps-container">
            ${steps.map(step => `
                <button class="btn-next-step" onclick="confirmAndProceed('${step}')">
                    <i class="fas fa-arrow-right"></i>
                    Proceed to ${toTitleCase(step)}
                </button>
            `).join('')}
        </div>
    `;
    
    return nextSteps;
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Setup file input change handler
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    
    // Setup drag and drop
    setupDragAndDrop();
    
    // Set up tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
});

function switchTab(tabId) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`${tabId}-list`).classList.add('active');
}

async function confirmAndProceed(analysisType) {
    try {
        const response = await fetch(`/confirm/${analysisType}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        flash(data.message, 'success');
        
        // Handle next steps based on analysis type
        switch(analysisType) {
            case 'interaction_analysis':
                await startInteractionAnalysis();
                break;
            case 'component_analysis':
                await startComponentAnalysis();
                break;
            case 'timeline':
                await generateTimeline();
                break;
        }
    } catch (error) {
        flash('Error confirming analysis', 'error');
    }
}

async function startInteractionAnalysis() {
    try {
        const response = await fetch('/analyze/interactions', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        displayInteractions(data.scenes, data.interactions);
        flash('Interaction analysis completed!', 'success');
        showNextSteps(['component_analysis', 'timeline']);
    } catch (error) {
        const err_msg = `Error analyzing interactions: ${error}`;
        flash(err_msg, 'error');
    }
}

async function startComponentAnalysis() {
    try {
        const response = await fetch('/analyze/components', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        displayComponents(data.components);
        flash('Component analysis completed!', 'success');
    } catch (error) {
        flash('Error analyzing components', 'error');
    }
}

async function generateTimeline() {
    try {
        const response = await fetch('/analyze/timeline', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        displayTimeline(data.timeline);
        flash('Timeline generated successfully!', 'success');
    } catch (error) {
        flash('Error generating timeline', 'error');
    }
}

async function exportTimeline() {
    try {
        const response = await fetch('/export/timeline');
        const blob = await response.blob();
        downloadFile(blob, 'scene_timeline.json');
    } catch (error) {
        flash('Error exporting timeline', 'error');
    }
}

async function exportComponents() {
    try {
        const response = await fetch('/export/components');
        const blob = await response.blob();
        downloadFile(blob, 'entity_components.json');
    } catch (error) {
        flash('Error exporting components', 'error');
    }
}

function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

async function getInteractionMap() {
    try {
        const response = await fetch('/analyze/interaction-map');
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        displayInteractionMap(data.interaction_map);
        flash('Interaction map generated!', 'success');
    } catch (error) {
        flash('Error generating interaction map', 'error');
    }
}

function displayInteractions(scenes, interactions) {
    const resultsSection = document.getElementById('results-section');
    const interactionsList = document.getElementById('interactions-list');
    
    resultsSection.style.display = 'block';
    interactionsList.innerHTML = '<h3>Scene Interactions</h3>';
    
    // Group interactions by scene
    const sceneInteractions = {};
    Object.entries(interactions).forEach(([id, interaction]) => {
        const sceneId = interaction.scene_id;
        if (!sceneInteractions[sceneId]) {
            sceneInteractions[sceneId] = [];
        }
        sceneInteractions[sceneId].push({ id, ...interaction });
    });

    // Create sections for each scene
    Object.entries(scenes).forEach(([sceneId, scene]) => {
        const sceneSection = document.createElement('div');
        sceneSection.className = 'scene-section';
        sceneSection.innerHTML = `
            <div class="scene-card">
                <div class="scene-header">
                    <h4>
                        <i class="fas fa-film"></i>
                        ${scene.name}
                    </h4>
                    <span class="scene-id">${sceneId}</span>
                </div>
                <p class="scene-description">${scene.description}</p>
                <div class="scene-entities">
                    <h5>Present Entities:</h5>
                    <div class="entity-tags">
                        ${scene.entities_present.map(id => `
                            <span class="entity-tag">${id}</span>
                        `).join('')}
                    </div>
                </div>
                <div class="interactions-grid">
                    ${(sceneInteractions[sceneId] || []).map(interaction => `
                        <div class="interaction-card" data-interaction-id="${interaction.id}">
                            <div class="interaction-header">
                                <span class="interaction-id">${interaction.id}</span>
                                <div class="interaction-type ${interaction.type.toLowerCase()}">
                                    <i class="fas ${getInteractionIcon(interaction.type)}"></i>
                                    ${interaction.type}
                                </div>
                            </div>
                            <p class="interaction-action">${interaction.action}</p>
                            <div class="interaction-entities">
                                <span class="subject">${interaction.subject_id}</span>
                                <i class="fas fa-arrow-right"></i>
                                <span class="target">${interaction.target_id}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        interactionsList.appendChild(sceneSection);
    });
    
    // Switch to the interactions tab
    switchTab('interactions');
}

function getInteractionIcon(type) {
    const icons = {
        'physical': 'fa-hand-paper',
        'dialogue': 'fa-comments',
        'observation': 'fa-eye',
        'movement': 'fa-walking'
    };
    return icons[type.toLowerCase()] || 'fa-question';
}