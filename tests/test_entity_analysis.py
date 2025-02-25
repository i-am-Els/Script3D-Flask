import pytest
from app import app, EntityExtractionResult, InteractionAnalysisResult, EntityComponentResult, TimelineResult
from unittest.mock import patch

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@pytest.fixture
def mock_entity_response():
    return {
        "entities": {
            "E001": {
                "id": "E001",
                "name": "JOHN",
                "type": "character",
                "description": "Main character",
                "is_interactive": True
            },
            "E002": {
                "id": "E002",
                "name": "DOOR",
                "type": "prop",
                "description": "A wooden door",
                "is_interactive": True
            }
        }
    }

@pytest.fixture
def mock_interaction_response():
    return {
        "scenes": {
            "S001": {
                "id": "S001",
                "name": "Opening Scene",
                "description": "John enters through the door",
                "entities_present": ["E001", "E002"]
            }
        },
        "interactions": {
            "I001": {
                "id": "I001",
                "scene_id": "S001",
                "subject_id": "E001",
                "target_id": "E002",
                "action": "opens",
                "type": "physical"
            }
        }
    }

def test_entity_analysis(client, mock_entity_response):
    """Test entity analysis endpoint"""
    with patch('app.extract_entities') as mock_extract:
        mock_extract.return_value = EntityExtractionResult(**mock_entity_response)
        
        response = client.post('/analyze/entities', data={
            'text_content': 'JOHN opens the DOOR.'
        })
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'success'
        assert 'entities' in data
        assert len(data['entities']) == 2
        assert data['entities']['E001']['name'] == 'JOHN'

        # Check session data
        with client.session_transaction() as sess:
            assert 'screenplay_text' in sess
            assert sess['screenplay_text'] == 'JOHN opens the DOOR.'
            assert 'entities' in sess
            assert sess['entities'] == mock_entity_response

def test_interaction_analysis(client, mock_entity_response, mock_interaction_response):
    """Test interaction analysis endpoint"""
    with client.session_transaction() as sess:
        sess['entities'] = mock_entity_response
        sess['screenplay_text'] = 'JOHN opens the DOOR.'
    
    with patch('app.analyze_scene_interactions') as mock_analyze:
        mock_analyze.return_value = InteractionAnalysisResult(**mock_interaction_response)
        
        response = client.post('/analyze/interactions')
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'success'
        assert 'scenes' in data
        assert 'interactions' in data
        assert len(data['interactions']) == 1

        # Check session data
        with client.session_transaction() as sess:
            assert 'scenes' in sess
            assert sess['scenes'] == mock_interaction_response['scenes']
            assert 'interactions' in sess
            assert sess['interactions'] == mock_interaction_response['interactions']

def test_component_analysis(client, mock_entity_response, mock_interaction_response):
    """Test component analysis endpoint"""
    with client.session_transaction() as sess:
        sess['entities'] = mock_entity_response
        sess['interactions'] = mock_interaction_response['interactions']
    
    # Updated mock_components to match the expected structure
    mock_components = {
        "E001": {
            "required_components": [
                {
                    "component_id": "COMP001",
                    "reason": "Required for movement",
                    "interactions": ["I001"],  # List of interactions related to this component
                    "description": "Movement component for character actions",
                    "name": "Movement"
                }
            ]
        },
        "E002": {
            "required_components": [
                {
                    "component_id": "COMP002",
                    "reason": "Required for interaction with the environment",
                    "interactions": ["I001"],  # List of interactions related to this component
                    "description": "Component for interacting with props",
                    "name": "Interaction"
                }
            ]
        }
    }
    
    with patch('app.analyze_entity_components') as mock_analyze:
        mock_analyze.return_value = EntityComponentResult(entities=mock_components)  # Ensure the structure matches
        
        response = client.post('/analyze/components')
        
        assert response.status_code == 200
        data = response.get_json()
        assert 'status' in data
        assert data['status'] == 'success'
        assert 'components' in data
        assert data['components'] == mock_components

        # Check session data
        with client.session_transaction() as sess:
            assert 'components' in sess
            assert sess['components'] == mock_components

def test_timeline_generation(client, mock_interaction_response):
    """Test timeline generation endpoint"""
    with client.session_transaction() as sess:
        sess['scenes'] = mock_interaction_response['scenes']
        sess['interactions'] = mock_interaction_response['interactions']
        sess['components'] = {
            "E001": {
                "required_components": []
            }
        }
    
    mock_timeline = {
        "timelines": [
            {
                "scene_id": "S001",
                "events": [
                    {
                        "interaction_id": "I001",
                        "start_time": 0.0,
                        "duration": 2.5,
                        "components_involved": ["COMP001", "COMP002"]
                    }
                ]
            },
            {
                "scene_id": "S002",
                "events": [
                    {
                        "interaction_id": "I002",
                        "start_time": 1.0,
                        "duration": 3.0,
                        "components_involved": ["COMP003"]
                    }
                ]
            }
        ]
    }

    with patch('app.generate_timeline') as mock_generate:
        mock_generate.return_value = TimelineResult(timelines=mock_timeline['timelines'])
    
        response = client.post('/analyze/timeline')

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'success'
        assert 'timelines' in data
        assert data['timelines']["timelines"] == mock_timeline['timelines']  # Ensure the structure matches

        # Check session data
        with client.session_transaction() as sess:
            assert 'timelines' in sess
            assert sess['timelines']["timelines"] == mock_timeline['timelines']

def test_interaction_map(client, mock_entity_response, mock_interaction_response):
    """Test interaction map endpoint"""
    with client.session_transaction() as sess:
        sess['entities'] = mock_entity_response
        sess['interactions'] = mock_interaction_response['interactions']
    
    response = client.get('/analyze/interaction-map')
    
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'success'
    assert 'interaction_map' in data
    assert 'E001' in data['interaction_map']
    assert len(data['interaction_map']['E001']['as_subject']) > 0

def test_error_handling(client):
    """Test error handling in analysis endpoints"""
    # Test missing screenplay text
    response = client.post('/analyze/entities', data={})
    assert response.status_code == 400
    
    # Test missing session data
    response = client.post('/analyze/interactions')
    assert response.status_code == 400
    
    # Test invalid analysis type
    response = client.post('/confirm/invalid_type')
    assert response.status_code == 400