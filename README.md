## Script3D-Flask
This `Flask` project is a part of a bigger solution called `Script3D`.
It is a solution that aims to automate the process of creating `cinematic` and `cutscenes` in games, and employs the power of `LLM`s 
to extract meaningful information that is later passed on to a custom game engine that is a part of the `Script3D` project suite called `Purity Engine`.

`Purity Engine` takes in the information generated from this tool and uses it in `GameObject Instantiation`, `Scene Composition`,
`Component Setup`, and `Timeline Generation`. These processes involve stages required to simplify the tedious process of creating
gameplay cinematic and cutscenes. 
### Setup information
#### First Clone the repo.
Open up your preferred terminal and enter the command below.
```shell
git clone https://github.com/i-am-Els/Script3D-Flask.git
```
#### Setup virtual environment
Set up a virtual environment to run your flask app in.
```shell
python -m venv .venv
```
- Activate environment
```shell
.venv/Scripts/activate.bat
```
#### Install Requirements
Install all the required modules of your app like flask, groq etc.
To do this in one command use the command below.
```shell
pip install -r requirements.txt
```
#### Create a `.env` file for your environment variables in root.
Create variables for your `GROQ_API_KEY` and `FLASK_SECRET_KEY`.
```shell
  GROQ_API_KEY=your-groq-api-key
  FLASK_SECRET_KEY=your-flask-secret-key
```
To get your `FLASK_SECRET_KEY`, run the command below in your terminal.
```shell
python -c 'import secrets; print(secrets.token_hex())'
```

### Run the App
With the set-up done and out of the way, you can run the app in terminal with the command
```shell
flask run
```
You should see a message as such:
> \* Debug mode: off
>
> WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
> 
> \* Running on http://127.0.0.1:5000
> 
> Press CTRL+C to quit

Click the link, depending on your IDE of choice, it might require a `ctrl` + `click` to load the webpage.
Alternatively, you can copy and load the web address in your browser.

### Usage
#### Input
Upload a file either in the `PDF`, `TXT` or `FOUNTAIN` formats.
You can also type in the screenplay in the text area or paste a plain text screenplay in there.

#### Output
A downloadable json of the structure of elements extracted from the process.