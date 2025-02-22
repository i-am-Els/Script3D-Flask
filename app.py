from flask import Flask, render_template, request, jsonify, send_file, flash
import json
import io
import os
from PyPDF2 import PdfReader
from groq import Groq
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from dotenv import load_dotenv

load_dotenv()  # Add this near the top of your script

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024  # 8MB limit
app.secret_key = os.environ['FLASK_SECRET_KEY']  # Simplified since we know the key exists

# Allowed file extensions
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'fountain'}

# Pydantic models for structured screenplay analysis
class SceneElement(BaseModel):
    type: str = Field(description="Type of scene element (scene_heading, character, dialogue, transition, etc.)")
    content: str = Field(description="The actual content of the element")
    scene_number: Optional[int] = Field(description="Scene number where this element appears")

class CharacterInteraction(BaseModel):
    subject: str = Field(description="Character performing the action")
    action: str = Field(description="What the character did")
    object: Optional[str] = Field(description="Character or thing being acted upon")
    scene_context: str = Field(description="Brief context of the scene where this interaction occurs")

class UnityComponent(BaseModel):
    name: str = Field(description="Name of the Unity component")
    purpose: str = Field(description="Why this component is needed")
    properties: Dict[str, str] = Field(description="Key properties that need to be configured")

class CharacterGameSetup(BaseModel):
    character: str = Field(description="Character name")
    interactions: List[str] = Field(description="List of all interactions this character performs")
    required_components: List[UnityComponent] = Field(description="Required Unity components for this character")

class ScreenplayAnalysis(BaseModel):
    scene_elements: List[SceneElement] = Field(description="All extracted scene elements")
    character_interactions: List[CharacterInteraction] = Field(description="All character interactions")
    interactions_by_character: Dict[str, List[CharacterInteraction]] = Field(description="Interactions grouped by character")
    game_setup: List[CharacterGameSetup] = Field(description="Game engine setup requirements for each character")


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

def query_llm(prompt: str, context: str) -> dict:
    """
    Query Groq LLM with structured screenplay analysis
    """
    try:
        # Calculate approximate tokens (rough estimate: 4 chars = 1 token)
        estimated_tokens = len(context) // 4
        
        if estimated_tokens > 3000:  # Reduced from 4000 to stay well under the 5000 TPM limit
            context_summary = context[:12000]  # 3000 tokens * 4 chars
            system_message = """
            You are an AI assistant specialized in analyzing screenplays. Your response must be a JSON object with EXACTLY these fields:
            {
                "scene_elements": [
                    {
                        "type": "scene_heading|character|dialogue|transition",
                        "content": "actual text content",
                        "scene_number": optional number
                    }
                ],
                "character_interactions": [
                    {
                        "subject": "character performing action",
                        "action": "what they did",
                        "object": "who/what they interacted with",
                        "scene_context": "brief scene description"
                    }
                ],
                "interactions_by_character": {
                    "CHARACTER_NAME": [
                        {same structure as character_interactions}
                    ]
                },
                "game_setup": [
                    {
                        "character": "character name",
                        "interactions": ["list", "of", "actions"],
                        "required_components": [
                            {
                                "name": "Unity component name",
                                "purpose": "why it's needed",
                                "properties": {
                                    "property_name": "property description"
                                }
                            }
                        ]
                    }
                ]
            }
            
            Analyze this portion of the screenplay and provide output in EXACTLY this format.
            """
        else:
            context_summary = context
            system_message = """
            You are an AI assistant specialized in analyzing screenplays. Your response must be a JSON object with EXACTLY these fields:
            {
                "scene_elements": [
                    {
                        "type": "scene_heading|character|dialogue|transition",
                        "content": "actual text content",
                        "scene_number": optional number
                    }
                ],
                "character_interactions": [
                    {
                        "subject": "character performing action",
                        "action": "what they did",
                        "object": "who/what they interacted with",
                        "scene_context": "brief scene description"
                    }
                ],
                "interactions_by_character": {
                    "CHARACTER_NAME": [
                        {same structure as character_interactions}
                    ]
                },
                "game_setup": [
                    {
                        "character": "character name",
                        "interactions": ["list", "of", "actions"],
                        "required_components": [
                            {
                                "name": "Unity component name",
                                "purpose": "why it's needed",
                                "properties": {
                                    "property_name": "property description"
                                }
                            }
                        ]
                    }
                ]
            }
            
            Analyze the complete screenplay and provide output in EXACTLY this format.
            """

        client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": f"Instructions: {prompt}\n\nScreenplay content: {context_summary}"}
            ],
            model="mixtral-8x7b-32768",
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        response_data = ScreenplayAnalysis.parse_raw(completion.choices[0].message.content)
        return response_data.dict()
    
    except Exception as e:
        error_message = str(e)
        if "rate_limit_exceeded" in error_message:
            flash("The screenplay is too long to process at once. Only analyzing the first portion.", "warning")
        else:
            flash(f"Error in screenplay analysis: {error_message}", "error")
        return {"error": error_message}

@app.route('/analyze_screenplay', methods=['POST'])
def analyze_screenplay():
    try:
        uploaded_file = request.files.get('file')
        analysis_type = request.form.get('analysis_type', 'full')
        
        if not uploaded_file or uploaded_file.filename == '':
            flash("No file uploaded", "error")
            return jsonify({"error": "No file uploaded"})

        if not allowed_file(uploaded_file.filename):
            flash("Invalid file type. Allowed: PDF, TXT, Fountain", "error")
            return jsonify({"error": "Invalid file type. Allowed: PDF, TXT, Fountain"})

        screenplay_text = extract_text_from_file(uploaded_file)
        if not screenplay_text:
            flash("Could not extract text from file", "error")
            return jsonify({"error": "Could not extract text from file"})

        # Define prompt based on analysis type
        prompts = {
            'elements': "Extract and categorize all scene elements from the screenplay.",
            'interactions': "Analyze all character interactions and group them by character.",
            'game_setup': "Determine required Unity components for each character based on their interactions.",
            'full': "Perform complete screenplay analysis including scene elements, character interactions, and Unity component requirements."
        }

        analysis_result = query_llm(prompts.get(analysis_type, prompts['full']), screenplay_text)

        if "error" in analysis_result:
            flash(analysis_result["error"], "error")
            return jsonify(analysis_result)
            
        flash("Analysis completed successfully!", "success")
        return jsonify({
            "analysis": analysis_result,
            "file_name": uploaded_file.filename,
            "analysis_type": analysis_type
        })
    except Exception as e:
        flash(str(e), "error")
        return jsonify({"error": str(e)})


@app.route('/')
def index():
    return render_template("index.html")


@app.route('/chat', methods=['POST'])
def chat():
    print("Chat endpoint hit")  # Debug print
    try:
        user_input = request.form.get("user_input", "")
        uploaded_file = request.files.get('file')
        
        print(f"User input: {user_input}")  # Debug print
        print(f"File received: {uploaded_file.filename if uploaded_file else 'No file'}")  # Debug print
        
        if not uploaded_file or uploaded_file.filename == '':
            return jsonify({"error": "No file uploaded"})

        if not allowed_file(uploaded_file.filename):
            return jsonify({"error": "Invalid file type. Allowed: PDF, TXT, Fountain"})

        file_text = extract_text_from_file(uploaded_file)
        if not file_text:
            return jsonify({"error": "Could not extract text from file"})

        # Process with LLM and get structured output
        structured_response = query_llm(user_input, file_text)

        return jsonify({
            "response": structured_response,
            "file_content": file_text[:500] + "..." if file_text else ""
        })
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")  # Debug print
        return jsonify({"error": str(e)})


@app.route('/download_json', methods=['POST'])
def download_json():
    data = request.get_json()
    json_bytes = io.BytesIO()
    json_bytes.write(json.dumps(data, indent=4).encode('utf-8'))
    json_bytes.seek(0)
    return send_file(
        json_bytes,
        as_attachment=True,
        download_name='output.json',
        mimetype='application/json'
    )

if __name__ == '__main__':
    app.run(debug=True)
