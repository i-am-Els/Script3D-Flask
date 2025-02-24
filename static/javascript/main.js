let droppedFile = null;
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
    console.log('handleFile', file);
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
    droppedFile = file;
    handleFile(file);

}

function clearTabs() {
    // Remove all contents from the timeline editor.
    const timelineEditor = document.getElementById('timeline-editor');
    if (timelineEditor) {
        timelineEditor.innerHTML = '';
    }
    // Remove all contents from the timeline section.
    const timelineSection = document.getElementById('timeline-table');
    if (timelineSection) {
        timelineSection.innerHTML = '';
    }

    // Remove all contents from the entities list.
    const entitiesList = document.getElementById('entities-list');
    if (entitiesList) {
        entitiesList.innerHTML = '';
    }

    // Remove all contents from the interactions list.
    const interactionsList = document.getElementById('interactions-list');
    if (interactionsList) {
        interactionsList.innerHTML = '';
    }

    // Remove all contents from the components list.
    const componentsList = document.getElementById('components-list');
    if (componentsList) {
        componentsList.innerHTML = '';
    }
}


// Start entity analysis
async function startAnalysis() {
    clearTabs();
    const chatInput = document.getElementById('chatInput');
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.querySelector('.btn-primary');
    const textContent = chatInput.value.trim();
    const file = fileInput.files[0] ? fileInput.files[0] : droppedFile;

    if (!textContent && !file) {
        flash('Please either upload a file or paste your screenplay text.', 'error');
        return;
    }

    // Show loading state
    const originalContent = setLoadingState(analyzeBtn, true);

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

        switchTab('entities');
    } catch (error) {
        console.error('Error:', error);
        flash('Error processing request', 'error');
    } finally {
        setLoadingState(analyzeBtn, false, originalContent);
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
    if (steps.includes('component_analysis')) {
        const interactionNextSteps = createNextStepsElement(
            ['component_analysis'], 
            'interactions'
        );
        document.getElementById('interactions-list').appendChild(interactionNextSteps);
    }

    // Create next steps for interactions tab
    if (steps.includes('timeline')) {
        const interactionNextSteps = createNextStepsElement(
            ['timeline'], 
            'components'
        );
        document.getElementById('components-list').appendChild(interactionNextSteps);
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
                <button id="btn-${step}" class="btn-next-step" onclick="confirmAndProceed('${step}')">
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
    // Remove active class from all top-level tabs and content
    document.querySelectorAll('.tab-btn:not(#timeline-list .tab-btn)').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane:not(#timeline-list .tab-pane)').forEach(pane => pane.classList.remove('active'));

    // Add active class to selected tab and content
    const selectedTab = document.querySelector(`[data-tab="${tabId}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
        document.getElementById(`${tabId}-list`).classList.add('active');
    }
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
    const analyzeBtn = document.getElementById('btn-interaction_analysis'); // Use the specific ID for the button
    const originalContent = setLoadingState(analyzeBtn, true); // Set loading state

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
        showNextSteps(['component_analysis']);
    } catch (error) {
        const err_msg = `Error analyzing interactions: ${error}`;
        flash(err_msg, 'error');
    } finally {
        setLoadingState(analyzeBtn, false, originalContent); // Restore button state
    }
}

async function startComponentAnalysis() {
    const analyzeBtn = document.getElementById('btn-component_analysis'); // Use the specific ID for the button
    const originalContent = setLoadingState(analyzeBtn, true); // Set loading state

    try {
        const response = await fetch('/analyze/components', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        displayComponents(data);
        flash('Component analysis completed!', 'success');

        showNextSteps(['timeline']);
    } catch (error) {
        const err_msg = `Error analyzing components: ${error}`;
        flash(err_msg, 'error');
    } finally {
        setLoadingState(analyzeBtn, false, originalContent); // Restore button state
    }
}

async function generateTimeline() {
    const analyzeBtn = document.getElementById('btn-timeline'); // Use the specific ID for the button
    const originalContent = setLoadingState(analyzeBtn, true); // Set loading state

    try {
        const response = await fetch('/analyze/timeline', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.error) {
            flash(data.error, 'error');
            return;
        }

        displayTimelines(data.timelines);
        flash('Timeline generated successfully!', 'success');

        showNextSteps(['']);

    } catch (error) {
        const err_msg = `Error generating timeline: ${error}`;
        flash(err_msg, 'error');
    } finally {
        setLoadingState(analyzeBtn, false, originalContent); // Restore button state
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

// Function to display component analysis results
function displayComponents(components) {
    const componentsList = document.getElementById('components-list');
    componentsList.innerHTML = ''; // Clear previous content

    if (!components || Object.keys(components).length === 0) {
        componentsList.innerHTML = '<p>No component analysis results found.</p>';
        return;
    }

    // Create a container for the two-column layout
    const container = document.createElement('div');
    container.className = 'components-container';

    // Left column for Unity components
    const leftColumn = document.createElement('div');
    leftColumn.className = 'components-left-column';

    // Right column for component analysis data
    const rightColumn = document.createElement('div');
    rightColumn.className = 'components-right-column';

    console.log(components.unity_components);

    // Populate the left column with Unity components
    if (components && Array.isArray(components.unity_components)) {
        // Create and append the header
        const header = document.createElement('h3');
        header.textContent = 'All Available Components';
        header.style.fontSize = '0.9rem'; // Adjust font size as needed
        header.style.marginBottom = '0.7rem'; // Space below the header
        leftColumn.appendChild(header);

        components.unity_components.forEach(component => {
            const componentName = Object.keys(component)[0]; // Get the component name (key)
            const componentDetails = component[componentName]; // Get the details using the name

            const componentItem = document.createElement('div');
            componentItem.className = 'component-item';
            componentItem.innerHTML = `
                <div>
                    <span class="component-name"><i class="fas fa-cog"></i>${componentName}</span>
                    <span class="component-id" style="background-color: #e0e0e0; padding: 2px 5px; border-radius: 3px;">(${componentDetails.id})</span>
                    <div class="component-details">
                        <p>${componentDetails.description}</p>
                    </div>
                </div>
            `;
            leftColumn.appendChild(componentItem);
        });
    } else {
        const noComponentsMessage = document.createElement('p');
        noComponentsMessage.textContent = 'No Unity components found.';
        leftColumn.appendChild(noComponentsMessage);
    }

    // Populate the right column with component analysis data
    Object.entries(components.components).forEach(([entityId, entityData]) => {
        const entitySection = document.createElement('div');
        entitySection.className = 'entity-section';
        entitySection.innerHTML = `
            <div class="entity-card">
                <div class="entity-header">
                    <span class="entity-name">Entity ID: </span>
                    <span class="entity-id">${entityId}</span>
                </div>
                <div class="required-components">
                    <h5>Required Components:</h5>
                    <table class="components-table">
                        <thead>
                            <tr>
                                <th>Component ID</th>
                                <th>Reason</th>
                                <th>Interactions</th>
                                <th>Description</th>
                                <th>Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${entityData.required_components.map(component => `
                                <tr>
                                    <td>${component.component_id}</td>
                                    <td>${component.reason}</td>
                                    <td>${component.interactions.join(', ')}</td>
                                    <td>${component.description || 'N/A'}</td>
                                    <td>${component.name || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        rightColumn.appendChild(entitySection);
    });

    // Add the left and right columns to the container
    container.appendChild(leftColumn);
    container.appendChild(rightColumn);

    // Append the container to the components list
    componentsList.appendChild(container);

    // Switch to the components tab
    switchTab('components'); 
}

function setLoadingState(button, isLoading, originalContent=null) {
    if (isLoading) {
        if (originalContent === null) {
            originalContent = button.innerHTML;
        }
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        button.disabled = true;
        return originalContent; // Return the original content for later use
    } else {
        if (originalContent !== null) {
            button.innerHTML = originalContent; // Restore original content
        }
        button.disabled = false;
    }
}

function displayTimelines(timelines) {
    const timelineSection = document.getElementById('timeline-table');
    timelineSection.innerHTML = ''; // Clear previous content

    if (!timelines || timelines.length === 0) {
        timelineSection.innerHTML = '<p>No timeline events found.</p>';
        return;
    }
    
    const timelineEditor = document.getElementById('timeline-editor');
    timelineEditor.innerHTML = ''; // Clear previous content
    
    if (!timelines || timelines.length === 0) {
        timelineEditor.innerHTML = '<p>No timeline events found.</p>';
        return;
    }
    
    // Create a container for the timeline
    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';

    timelines.timelines.forEach(timeline => {
        // Create a header for each scene
        const header = document.createElement('h3');
        header.textContent = `Timeline for Scene ID: ${timeline.scene_id}`;
        timelineSection.appendChild(header);
        
        // Create a table for the timeline events
        const table = document.createElement('table');
        table.className = 'timeline-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Interaction ID</th>
                    <th>Start Time</th>
                    <th>Duration</th>
                    <th>Components Involved</th>
                </tr>
            </thead>
            <tbody>
                ${timeline.events.map(event => `
                    <tr>
                        <td>${event.interaction_id}</td>
                        <td>${event.start_time.toFixed(2)}s</td>
                        <td>${event.duration.toFixed(2)}s</td>
                        <td>${event.components_involved.join(', ')}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;

        // Append the table to the timeline section
        timelineSection.appendChild(table);
        
        // Display the timeline editor.
    
        const sceneDiv = document.createElement('div');
        sceneDiv.className = 'scene-timeline';
        const sceneHeader = document.createElement('h4');
        sceneHeader.textContent = `Scene ID: ${timeline.scene_id}`;
        sceneDiv.appendChild(sceneHeader);
        
        // Create a timeline track
        const track = document.createElement('div');
        track.className = 'timeline-track';
        
        timeline.events.forEach(event => {
            const eventBlock = document.createElement('div');
            eventBlock.className = 'timeline-event';
            eventBlock.style.left = `${event.start_time * 10}px`; // Scale factor for visualization
            eventBlock.style.width = `${event.duration * 10}px`; // Scale factor for visualization
            eventBlock.title = `Interaction ID: ${event.interaction_id}`; // Tooltip for interaction ID
            track.appendChild(eventBlock);
        });
        
        sceneDiv.appendChild(track);
        timelineContainer.appendChild(sceneDiv);
        
        timelineEditor.appendChild(timelineContainer);
    });
    
    switchTab('timeline');
}

function setupTimelineTabs() {
    const tabButtons = document.querySelectorAll('#timeline-list .timeline-tab-btn');
    const tabPanes = document.querySelectorAll('#timeline-list .timeline-tab-content .timeline-tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all inner buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to the clicked button and corresponding pane
            button.classList.add('active');
            const activeTab = button.getAttribute('data-tab');
            document.getElementById(activeTab).classList.add('active');
        });
    });
}

// Call the setup function after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', setupTimelineTabs);
