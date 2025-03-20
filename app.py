from flask import Flask, render_template, request, jsonify, send_file, flash, session, make_response
from flask_session import Session
import json
import io
import os
from pypdf import PdfReader
from groq import Groq
from pydantic import BaseModel, Field, ValidationError
from typing import List, Optional, Dict, Literal, Any
from dotenv import load_dotenv
from enum import Enum
from datetime import datetime
from functools import wraps
from dataclasses import dataclass
import redis


load_dotenv()  # Add this near the top of your script

r = redis.from_url(f'redis://{os.environ["REDIS_USERNAME"]}:{os.environ["REDIS_PASSWORD"]}@{os.environ["REDIS_HOST"]}:{os.environ["REDIS_PORT"]}/{os.environ["REDIS_DB"]}')

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024  # 8MB limit
app.secret_key = os.environ['FLASK_SECRET_KEY']  # Simplified since we know the key exists
app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_REDIS'] = r

# Create and initialize the Flask-Session object AFTER `app` has been configured
server_session = Session(app)
# Session(app)


# Allowed file extensions
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'fountain'}

# Enums for fixed categories
class EntityType(str, Enum):
    CHARACTER = "character"
    PROP = "prop"
    ENVIRONMENT = "environment"

class InteractionType(str, Enum):
    PHYSICAL = "physical"
    DIALOGUE = "dialogue"
    OBSERVATION = "observation"
    MOVEMENT = "movement"

# Base Models
class Entity(BaseModel):
    id: str
    name: str
    type: EntityType
    description: str
    is_interactive: bool = True

class Interaction(BaseModel):
    id: str
    scene_id: str
    subject_id: str
    target_id: str
    action: str
    type: InteractionType
    # description: str

class Scene(BaseModel):
    id: str
    name: str
    description: str
    entities_present: List[str]

# Analysis Result Models
class ComponentRequirement(BaseModel):
    component_id: str
    reason: str
    interactions: List[str]
    description: str
    name: str

class EntityComponents(BaseModel):
    required_components: List[ComponentRequirement]

class InteractionRole(BaseModel):
    interactions: List[str]
    required_components: List[str]

class EntityInteractionMap(BaseModel):
    entity_id: str
    as_subject: InteractionRole
    as_target: InteractionRole

class TimelineEvent(BaseModel):
    interaction_id: str
    start_time: float
    duration: float
    components_involved: List[str]

class Timeline(BaseModel):
    scene_id: str
    events: List[TimelineEvent]

# First Phase Result
class EntityExtractionResult(BaseModel):
    entities: Dict[str, Entity]

# Second Phase Result
class InteractionAnalysisResult(BaseModel):
    scenes: Dict[str, Scene]
    interactions: Dict[str, Interaction]

# Final Analysis Results
class EntityComponentResult(BaseModel):
    entities: Dict[str, EntityComponents]

class InteractionMapResult(BaseModel):
    interaction_map: Dict[str, EntityInteractionMap]

class TimelineResult(BaseModel):
    timelines: List[Timeline]

class ScreenplayAnalysis(BaseModel):
    characters: Dict[str, dict]

# Add this near the top of the file, with other constants
UNITY_COMPONENTS = {
    "Transform": {
        "id": "COMP001",
        "description": "Basic position, rotation, and scale component"
    },
    "Animator": {
        "id": "COMP002",
        "description": "Handles character animations and state machines"
    },
    "AudioSource": {
        "id": "COMP003",
        "description": "Handles sound emission and voice"
    },
    "Rigidbody": {
        "id": "COMP004",
        "description": "Handles physical interactions and forces"
    },
    "Collider": {
        "id": "COMP005",
        "description": "Defines physical boundaries and collision detection"
    },
    "NavMeshAgent": {
        "id": "COMP006",
        "description": "Handles pathfinding and movement"
    },
    "VFXGraph": {
        "id": "COMP007",
        "description": "Handles visual effects and particles"
    },
    "DialogSystem": {
        "id": "COMP008",
        "description": "Manages character dialogue"
    },
    "IKSystem": {
        "id": "COMP009",
        "description": "Handles inverse kinematics for precise movements"
    },
    "EventTrigger": {
        "id": "COMP010",
        "description": "Manages interaction triggers"
    },
    "CharacterController": {
        "id": "COMP011",
        "description": "Handles character movement and physics"
    },
    "AIController": {
        "id": "COMP012",
        "description": "Manages NPC behavior"
    },
    "Timeline": {
        "id": "COMP013",
        "description": "Manages animation sequences"
    }
}

# Custom Exceptions
class AnalysisError(Exception):
    """Base exception for analysis errors"""
    pass

class EntityExtractionError(AnalysisError):
    """Raised when entity extraction fails"""
    pass

class InteractionAnalysisError(AnalysisError):
    """Raised when interaction analysis fails"""
    pass

# Session requirement decorator
def requires_session_data(*keys: str):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not len(keys):
                return error_response(ValueError("No session data received. Please restart analysis."))
            missing = [key for key in keys if key not in session]
            if missing:
                return error_response(ValueError(f"Missing required data: {', '.join(missing)}. Please restart analysis."))
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Standardized error response
def error_response(e: Exception, status_code: int = 400) -> tuple:
    error_msg = str(e)
    flash(error_msg, "error")
    return jsonify({"error": error_msg}), status_code

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_file(file):
    """Extract text from different file types"""
    try:
        if file.filename.endswith('.pdf'):
            pdf_reader = PdfReader(file)
            text = '\n'.join([page.extract_text() for page in pdf_reader.pages])
            return text
        elif file.filename.endswith(('.txt', '.fountain')):
            return file.read().decode('utf-8')
    except Exception as e:
        print(f"Error extracting text: {str(e)}")
        return None

def query_llm(prompt: str, context: str, response_model: Optional[BaseModel] = None) -> dict:
    """
    Generic LLM query service that handles all LLM interactions
    
    Args:
        prompt: System message/instructions for the LLM
        context: The content to analyze
        response_model: Optional Pydantic model to validate response
    
    Returns:
        Validated response dictionary
    """
    try:
        # Token management
        estimated_tokens = len(context) // 4
        context_summary = context[:8000] if estimated_tokens > 2000 else context
        
        if estimated_tokens > 2000:
            flash("Content too long. Only analyzing first portion.", "warning")

        # LLM query
        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": context_summary}
            ],
            model="mixtral-8x7b-32768",
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        # Parse response
        response_data = json.loads(completion.choices[0].message.content)
        
        # Validate with model if provided
        if response_model:
            validated_data = response_model.model_validate(response_data)
            return validated_data.model_dump()
        
        return response_data

    except Exception as e:
        error_message = str(e)
        flash(f"LLM Analysis Error: {error_message}", "error")
        return {"error": error_message}

def extract_entities(screenplay_text: str) -> EntityExtractionResult:
    """
    Extract entities from screenplay text using the LLM.
    Returns a validated EntityExtractionResult.
    """
    try:
        system_message = """
        Analyze this screenplay and identify ALL entities (characters, props, and environment elements) that appear.
        
        For each entity:
        1. Generate a unique ID (E001, E002, etc.)
        2. Determine its type (character, prop, or environment)
        3. Provide a brief description
        4. Determine if it's interactive
        
        Return ONLY a JSON object with this structure:
        {
            "entities": {
                "E001": {
                    "id": "E001",
                    "name": "Character/Prop Name",
                    "type": "character|prop|environment",
                    "description": "Brief description of the entity",
                    "is_interactive": true|false
                }
            }
        }
        
        Consider:
        - Characters: All speaking roles and named background characters
        - Props: Objects that are manipulated, referenced, or important to scenes
        - Environment: Key scene elements like "Cave Wall", "Street", "Building"
        - Interactive status: Can this entity be interacted with by others?
        """
        
        # Query LLM
        result = query_llm(system_message, screenplay_text, EntityExtractionResult)
        
        if "error" in result:
            raise ValueError(result["error"])
        
        # Validate response using Pydantic model
        validated_result = EntityExtractionResult(
            entities=result["entities"]
        )
        
        return validated_result

    except Exception as e:
        raise Exception(f"Entity extraction failed: {str(e)}")

def analyze_scene_interactions(screenplay_text: str, entities: Dict[str, Entity]) -> InteractionAnalysisResult:
    """
    Second phase: Analyze all interactions between entities in each scene
    """
    try:
        # Create a context with entities for the LLM
        entity_context = "\n".join([
            f"ID: {entity_id} | Name: {entity_data['name']} | Type: {entity_data['type']}"
            for entity_id, entity_data in entities.items()
        ])

        system_message = f"""
        Using ONLY the entities listed below, analyze the screenplay and identify ALL interactions.
        
        Available Entities:
        {entity_context}

        For EACH and EVERY scene:
        1. Generate a unique Scene ID (S001, S002, etc.)
        2. For EACH and EVERY interaction:
           - Generate a unique Interaction ID (I001, I002, etc.)
           - Identify the subject entity (must be from the Available Entities list)
           - Identify the target entity (must be from the Available Entities list)
           - Describe the action/interaction
           - Classify the type (physical, dialogue, observation, movement)
        3. List EACH and EVERY entities present in the scene. The entities must be either a subject or a target found in the interactions of the scene.

        Return ONLY a JSON object with this structure:
        {{
            "scenes": {{
                "S001": {{
                    "id": "S001",
                    "name": "Scene Name",
                    "description": "Brief scene description",
                    "entities_present": ["E001", "E002"]
                }}
            }},
            "interactions": {{
                "I001": {{
                    "id": "I001",
                    "scene_id": "S001",
                    "subject_id": "E001",
                    "target_id": "E002",
                    "action": "Specific action description",
                    "type": "physical|dialogue|observation|movement"
                }}
            }}
        }}

        Rules:
        1. ONLY use entities from the provided list
        2. Maintain chronological order of interactions
        3. Include ALL significant interactions in each scene
        4. Be specific in action descriptions
        """

        result = query_llm(system_message, screenplay_text, InteractionAnalysisResult)
        
        if "error" in result:
            raise ValueError(result["error"])
        
        # Validate response using Pydantic model
        validated_result = InteractionAnalysisResult(
            scenes=result["scenes"],
            interactions=result["interactions"]
        )
        
        return validated_result

    except Exception as e:
        raise Exception(f"Interaction analysis failed: {str(e)}")

def analyze_entity_components(entities: Dict[str, Entity], interactions: Dict[str, Interaction]) -> EntityComponentResult:
    """
    Analyze entities and their interactions to determine required Unity components
    """
    try:
        # Create context for the LLM with entities and their interactions
        context = {
            "entities": entities,
            "interactions": interactions,
            "available_components": UNITY_COMPONENTS
        }

        system_message = f"""
        Analyze each entity and their interactions to determine required Unity components.
        
        For EACH and EVERY entity:
        1. Consider all interactions where they are either subject or target
        2. Determine required components based on each of their actions and roles
        3. Provide reasoning for the choice of each component
        4. Provide a description and name for each component, using the predefined component iteratables below
        
        Use ONLY components from this predefined list:
        {json.dumps(UNITY_COMPONENTS, indent=2)}
        
        Return ONLY a JSON object with this structure:
        {{
            "entities": {{
                "E001": {{
                    "required_components": [
                        {{
                            "component_id": "COMP001",
                            "reason": "Specific reason based on interactions",
                            "interactions": ["I001", "I002"],
                            "description": "Description of the component",
                            "name": "Name of the component"
                        }}
                    ]
                }},
                "E002": {{
                    "required_components": [
                        {{
                            "component_id": "COMP002",
                            "reason": "Another reason based on interactions",
                            "interactions": ["I003", "I004"],
                            "description": "Description of the component",
                            "name": "Name of the component"
                        }}
                    ]
                }}
            }}
        }}
        """

        result = query_llm(system_message, json.dumps(context), EntityComponentResult)
        if "error" in result:
            raise ValueError(result["error"])
        
        # Validate response using Pydantic model
        try:
            validated_result = EntityComponentResult(**result)
        except ValidationError as e:
            raise ValueError(f"Validation failed: {e.errors()}")
        
        return validated_result

    except Exception as e:
        raise Exception(f"Component analysis failed: {str(e)}. Response: {result}")

def validate_components(components_data: EntityComponentResult) -> bool:
    """
    Validate that only predefined Unity components are used in the analysis.
    """
    valid_component_ids = {comp["id"] for comp in UNITY_COMPONENTS.values()}
    
    try:
        for entity_data in components_data.entities.values():
            for component in entity_data.required_components:
                if component.component_id not in valid_component_ids:
                    raise ValueError(f"Invalid component ID: {component.component_id}")
        return True
    except Exception as e:
        raise ValueError(f"Component validation failed: {str(e)}")

def generate_timeline(scenes: Dict[str, Scene], interactions: Dict[str, Interaction], components: Dict[str, EntityComponents]) -> TimelineResult:
    """
    Generate a chronological timeline of interactions with estimated durations
    """
    try:
        # Create context for the LLM
        context = {
            "scenes": scenes,
            "interactions": interactions,
            "components": components
        }

        system_message = """
        Create a chronological timeline of interactions with estimated durations.
        
        For each interaction:
        1. Estimate start time (in seconds from scene start)
        2. Estimate duration based on action type
        3. Identify components involved
        
        Rules for timing:
        - Physical actions: 1-5 seconds
        - Dialogue: 3-10 seconds
        - Observations: 2-4 seconds
        - Movement: Based on implied distance
        
        Return ONLY a JSON object with this structure:
        {
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
        
        Ensure:
        1. Events are chronologically ordered
        2. Possibility of overlapping actions(parallel actions)
        3. Realistic timing between related actions
        4. Component involvement matches previous analysis
        """

        result = query_llm(system_message, json.dumps(context), TimelineResult)
        if "error" in result:
            raise ValueError(result["error"])
        
        # Validate response using Pydantic model
        try:
            validated_result = TimelineResult(timelines=result["timelines"])
        except ValidationError as e:
            raise ValueError(f"Validation failed: {e.errors()}")
        
        return validated_result

    except Exception as e:
        raise Exception(f"Timeline generation failed: {str(e)}")

def perform_analysis(screenplay_text):
    """
    Perform analysis on the screenplay text.
    This is a placeholder function that should contain the logic
    for analyzing the screenplay and returning the results.
    """
    # Example analysis logic (replace with your actual logic)
    entities = extract_entities(screenplay_text)  # Assuming you have an entity extraction function
    interactions = analyze_interactions(screenplay_text)  # Assuming you have an interaction analysis function

    # Combine results into a single response
    return {
        "entities": entities,
        "interactions": interactions,
        "message": "Analysis completed successfully."
    }

def validate_session_data(required_data: List[str]) -> bool:
    """Validate that required data exists and is properly formatted"""
    try:
        for data_key in required_data:
            if data_key not in session:
                return False
            # Add specific validation for each data type
            if data_key == 'entities' and not isinstance(session[data_key], dict):
                return False
            # Add more validations as needed
        return True
    except Exception:
        return False

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/analyze/entities', methods=['POST'])
def analyze_entities():
    try:
        if 'file' in request.files:
            uploaded_file = request.files['file']
            screenplay_text = extract_text_from_file(uploaded_file)
        else:
            screenplay_text = request.form.get('text_content', '').strip()
            
        if not screenplay_text:
            raise ValueError("No screenplay text provided")

        # Get the analysis result
        result = extract_entities(screenplay_text)
        
        # Convert Pydantic models to dict for JSON serialization
        result_dict = result.model_dump()
        
        # Store in session
        session['screenplay_text'] = screenplay_text
        session['entities'] = result_dict
        
        # Return the response with dict instead of Pydantic model
        return jsonify({
            "status": "success",
            "entities": result_dict["entities"],
            "message": "Entity extraction completed"
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 400

@app.route('/download_json', methods=['POST'])
def download_json():
    # Implementation for downloading JSON
    pass

@app.route('/confirm/<analysis_type>', methods=['POST'])
@requires_session_data('entities')  # Base requirement
def confirm_analysis(analysis_type):
    try:
        valid_types = ['entities', 'interaction_analysis', 'component_analysis', 'interaction_map', 'timeline']
        if analysis_type not in valid_types:
            raise ValueError(f"Invalid analysis type: {analysis_type}")
        
        # Check additional requirements based on type
        if analysis_type in ['component_analysis', 'interaction_map', 'timeline']:
            if 'interactions' not in session:
                raise ValueError("No interactions found. Complete interaction analysis first.")
        
        next_steps = {
            'entities': ['interaction_analysis'],
            'interaction_analysis': ['component_analysis'],
            'component_analysis': ['timeline'],
            'timeline': []
        }
        
        display_type = analysis_type.replace('_', ' ').title()
        
        return jsonify({
            "status": "success",
            "message": f"{display_type} confirmed",
            "next_steps": next_steps[analysis_type]
        })

    except Exception as e:
        return error_response(e)

@app.route('/analyze/interactions', methods=['POST'])
@requires_session_data('entities', 'screenplay_text')
def analyze_interactions():
    try:
        entities = session['entities']['entities']
        screenplay_text = session['screenplay_text']
        
        result = analyze_scene_interactions(screenplay_text, entities)
        
        result_dict = result.model_dump()
        session['scenes'] = result_dict['scenes']
        session['interactions'] = result_dict['interactions']
        
        return jsonify({
            "status": "success",
            "message": "Interaction analysis completed",
            "scenes": result_dict['scenes'],
            "interactions": result_dict['interactions']
        })

    except Exception as e:
        return error_response(e)

@app.route('/analyze/components', methods=['POST'])
def analyze_components():
    try:
        if 'entities' not in session or 'interactions' not in session:
            return jsonify({"error": "Missing required data. Please complete previous steps."})
        
        entities = session['entities']['entities']
        interactions = session['interactions']
        
        # Perform component analysis
        result = analyze_entity_components(entities, interactions)
        
        # Validate components
        if validate_components(result):
            temp_unity_components = []
            for key, value in UNITY_COMPONENTS.items():
                temp_unity_components.append({key: value})
            # Store results in session
            result_dict = result.model_dump()['entities']
            session['components'] = result_dict
            session['unity_components'] = temp_unity_components
            
            return jsonify({
                "status": "success",
                "message": "Component analysis completed",
                "components": result_dict,
                "unity_components": temp_unity_components
            })
        else:
            return jsonify({"error": "Invalid components. Please try again."}), 400

    except ValueError as ve:
        return jsonify({"error": str(ve)})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/analyze/timeline', methods=['POST'])
def analyze_timeline():
    try:
        # Check for required session data
        if not all(key in session for key in ['scenes', 'interactions', 'components']):
            return jsonify({"error": "Missing required data. Please complete previous steps."})
        
        scenes = session['scenes']
        interactions = session['interactions']
        components = session['components']
        
        # Generate timeline
        timeline = generate_timeline(scenes, interactions, components)
        
        # Store in session
        session['timelines'] = timeline.model_dump()
        
        return jsonify({
            "status": "success",
            "message": "Timeline generated successfully",
            "timelines": timeline.model_dump()
        })

    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/export/timeline', methods=['GET'])
def export_timeline():
    try:
        if 'timelines' not in session:
            return jsonify({"error": "No timeline found. Please generate first."})
            
        timelines = session['timelines']
        interactions = session['interactions']
        
        # Create detailed export format
        export_data = {
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "version": "1.0"
            },
            "timeline": {
                "total_duration": sum(event["duration"] for event in timelines[0]["events"]),
                "events": []
            }
        }
        
        # Add detailed event information
        for event in timelines[0]["events"]:
            interaction = interactions.get(event["interaction_id"], {})
            export_data["timeline"]["events"].append({
                **event,
                "interaction_details": interaction
            })
            
        # Create the response with the JSON file
        response = make_response(jsonify(export_data))
        response.headers['Content-Type'] = 'application/json'
        response.headers['Content-Disposition'] = 'attachment; filename=scene_timeline.json'
        
        return response

    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/redo/interactions', methods=['POST'])
def redo_interactions():
    try:
        # Keep entities but clear interactions
        if 'interactions' in session:
            session.pop('interactions')
        if 'scenes' in session:
            session.pop('scenes')
            
        return jsonify({
            "status": "success",
            "message": "Ready for new interaction analysis"
        })

    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/export/components', methods=['GET'])
def export_components():
    try:
        if 'components' not in session:
            return jsonify({"error": "No component analysis found. Please analyze first."})
            
        components = session['components']
        entities = session['entities']['entities']
        scene = session['scenes']
        interaction = session['interactions']
        timeline = session['timelines']
        
        # Create a more detailed export format
        export_data = {
            "metadata": {
                "generated_at": datetime.now().isoformat(),
                "version": "1.0"
            },
            "data": {
                "entities": entities,
                "components": components,
                "scene": scene,
                "interactions": interaction,
                "timeline": timeline
            },
        }
        
        # # Combine entity info with their components
        # for entity_id, component_data in components.items():
        #     entity_info = entities.get(entity_id, {})
        #     export_data["entities"][entity_id] = {
        #         "name": entity_info.get("name", "Unknown"),
        #         "type": entity_info.get("type", "Unknown"),
        #         "components": component_data["required_components"]
        #     }
            
        # Create the response with the JSON file
        response = make_response(jsonify(export_data))
        response.headers['Content-Type'] = 'application/json'
        response.headers['Content-Disposition'] = 'attachment; filename=entity_components.json'
        
        return response

    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/analyze/interaction-map', methods=['GET'])
@requires_session_data('entities', 'interactions')
def get_interaction_map():
    try:
        entities = session['entities']['entities']
        interactions = session['interactions']
        
        # Create interaction map grouped by subject
        interaction_map = {}
        for entity_id, entity_data in entities.items():
            interaction_map[entity_id] = {
                "name": entity_data["name"],
                "as_subject": [],
                "as_target": []
            }
            
            # Map interactions where entity is subject or target
            for interaction_id, interaction in interactions.items():
                if interaction["subject_id"] == entity_id:
                    interaction_map[entity_id]["as_subject"].append(interaction)
                if interaction["target_id"] == entity_id:
                    interaction_map[entity_id]["as_target"].append(interaction)
        
        return jsonify({
            "status": "success",
            "interaction_map": interaction_map
        })

    except Exception as e:
        return error_response(e)


if __name__ == '__main__':
    app.run()
