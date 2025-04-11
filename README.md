# Web Reference Stack
This project is based on Python (FastAPI) and gives the users a blank canvas in Python to publish their solutions within a website and in an acceptable technical framework to go into production with entra id users while avoiding producing legacy code. This concretely means the following features: Entra ID role-based authentication, Azure logging, e2e tests with mockup, unit tests (Jest, PyTest), authenticated RealTime WebSocket connections and many more features. The whole stack auto-installs via terraform and derives its settings into the frontend and backend. You just have to adjust the app name.

## Features
In the following is a description of the provided features. **(please leave a star if you like this project)**
- Terraform __auto__ installation and setup
- Entra ID Authentication with __auto__ installation and setup **(You don't have to set up anything on frontend and backend)**
- Azure Application Insight logging with __auto__ installation and setup
- Test Driven Development Setup
    - E2E Testing (Cypress) + Coverage
    - Frontend Unit Testing (Jest) + Coverage 
    - Backend Unit Testing (PyTest) + Coverage
    - Mockout of Entra ID Token Authentication to Passthrough during development and testing (Role Authentication stays)
- Real Time Web Socket Connections with Token and Role Authentication
- Responsive Design and PWA support out of the box
- Logo flipping (Different Logo on dev, test, prod) 
- Running on Free Plan F1 of Azure App Service to avoid any unnecessary costs

## Prerequisites
In the following is a guide on how to set up the prerequisites for this project.

### Installation on Windows
This is how to install the prerequisites on Windows.
1. Install Chocolatey Installer https://chocolatey.org/. Open PowerShell Console in Admin Mode
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force;
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12;
Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'));
```
2. Install terraform with chocolatey and test if it was installed correctly that the command is available in root
```bash
choco install terraform
terraform -v
```
3. (Optional) Alternatively install OpenTofu as Alternative to Terraform (Set EXE=tofu env variable)
```powershell
Invoke-WebRequest -outfile "install-opentofu.ps1" -uri "https://get.opentofu.org/install-opentofu.ps1"
& .\install-opentofu.ps1 -installMethod standalone -skipVerify
```
4. Download and install Python https://www.python.org/downloads/ 
5. Download and install Node.js https://nodejs.org

### Installation on Linux-WSL
```bash
# Update package lists
sudo apt-get update

# Install system dependencies
sudo apt-get install -y libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev libnss3 libxss1 libasound2-dev libxtst6 xauth xvfb fonts-liberation libappindicator3-1 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libnspr4 libu2f-udev libvulkan1 wget gnupg curl python3 python3-pip python3-venv python3-pytest nodejs npm

# Install Google Chrome
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Install Microsoft Edge
curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
sudo install -o root -g root -m 644 microsoft.gpg /etc/apt/trusted.gpg.d/
sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/edge stable main" > /etc/apt/sources.list.d/microsoft-edge.list'
sudo rm microsoft.gpg
sudo apt-get update
sudo apt-get install -y microsoft-edge-stable
```

### Initialization
In the following is a guide to initialize the project to be your custom project.

#### Quick Init (Mock run without Terraform)
For a quick init start of the application just run
```bash
./initq.sh
```
on Linux or 
```powershell
./initq.ps1
```
on Windows.
It will set up the web applications to be runnable in __Mocked__ Debug mode without touching terraform.

### Terraform Local Setup
You have to set the following variables in the terraform var and tfvar files to attach the terraform installation to your project.

#### terraform_vars.tf
The following variable is very important to set because it's the name of the application and many other resources throughout the whole application are dependent on it.
- __app_name__ - the short name of the application - many names in terraform are derived from this.

#### Other variables (Optional)
The app is fully capable of running in Azure Free Plan but if you require more performance you can change these variables whether in var file (Default or in the specific environment file).
- web_plan_sku - "F1", "B1" ... will define the web plans for azure app services. For more information about the performance and costs, you can check this page https://azure.microsoft.com/en-us/pricing/details/app-service/windows/
- web_instances_count - The compute instances used for the plan. Per default it's 1.

You should not touch the env variable unless you really want to change the naming everywhere.

#### Terraform deployment
When you have set up everything, then __terraform will handle the whole deployment of the resources and the web application__. 

### Init Web Project
When you have set up terraform correctly, run the command to set up the web applications ready to run. Please note that you have to log on to Azure and select the correct subscription to make terraform run.
```bash
az login
./init.sh
```
on Linux or 
```powershell
az login
./init.ps1
```
on Windows.
This will first run terraform to adjust or install the Azure resources like the app registration and further will copy the terraform output to backend and frontend where its settings will be applied to adjust the authentication.

### VSCode setup, run and debugging
In the following is the VSCode setup to run and debug the application.
You need the following plugins to be installed in VS Code to enable Python debugging. Node.js runs natively as VSCode is designed for it.
- Python
- Python Debugger

When you open the Run and Debug section of VSCode, you will see all separate Frontend (Vite) and Backend (FastAPI) runners which come separately also in a Mock version. The Mock versions switch the Entra ID Authentication to a pass-through mode with Sample users. You have to click on Login and it will auto-login with the first user. By clicking on "Change User" it will automatically select the next user.

#### Full Stack runs
The full stack runs will start the whole page frontend and backend (whether in Mock or normal mode) plus Chrome in Debug mode. You can directly set breakpoints in backend as well as frontend to analyze the behavior or identify bugs on your page.

#### Attach to Chrome
This helps you when you do TDD with Cypress e2e testing. After you start Cypress, you can attach to the browser to set breakpoints in the frontend. 

#### Jest Current Test
This is a special debugger where you can debug the currently opened Jest test as well as the referenced js and jsx files.

### Test Runs
Here we will regard how to start the test runs locally.

#### Backend (PyTest)
You can start all test runs by calling. You have to be in the ./backend folder.
```bash
pytest -v
```
or if you want to run a specific test file
```bash
pytest -v [filepath]
```
to run the code coverage check you can call
```bash
pytest --cov
```
for a detailed view of the backend coverage 
```bash
pytest --cov --cov-report=html
```
afterward you can open index.html from the root project path to investigate the coverage in detail through the generated index.html page.

#### Frontend (Jest)
You can start all Jest tests by
```bash
npm t
```
or if you want to run a specific test file, use the Jest Current File debugger.
You can also call.
```bash
npm run test:preview
```
to use a preview run this before starting Jest tests. This will open up a webpage where you can see the current state of the Jest test.
You have to call global.debug() from your test to update this window if you want a specific state. Also, since this is buggy sometimes you have to refresh the page yourself most of the time. 

To perform a coverage check for Jest, you can run the following command
```bash
npm run test:coverage
```
Please note that it will only display coverage errors in the console when the coverage check fails.
The detailed coverage report can be found under index.html.

#### E2E Cypress 
To run the Cypress testing, you have multiple options. 
For just opening the Cypress suite where you can manually select the tests to run, just run
```bash
npm run test:e2e
```
For running the tests __automatically__ on the console __without a view__, run
```bash
npm run test:e2e:headless
```
If you want to run automatically, just run. It will pop up a window where you can see how the page is tested. It will close after finishing the tests.
```bash
npm run test:e2e:run
```
For checking the coverage, use the following commands
```bash
npm run test:e2e:coverage
npm run coverage:report:no-check
npm run check-coverage || true
```
The coverage output is the same folder as Jest, just this report remains in the root of it `frontend/coverage/index.html`. You can see there in detail which lines are affected by it and which are not.

#### Adjust coverage
To adjust the coverage, you have to edit the following files:
- Backend pyproject.toml under Line 14 `fail_under = 80` (just one setting here)
- Frontend `frontend/jest.config.js` Line 44
  ```javascript
      // Optional: Set coverage thresholds to make tests fail if coverage is too low
      coverageThreshold: {
        global: {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80
        },
  ```
- End 2 End Cypress / nyc .nycrc.json Line 7
  ```javascript 
  {
    "statements": 80,
    "branches": 65,
    "functions": 80,
    "lines": 80,
  }
  ```

#### Adjust Test Users
The test users with names are set up in accounts.js. You can change the existing users or add some new. Especially when you set up custom roles in your application, you would need to adjust that.
Just be careful to keep the same structure.
```javascript
const okabe = {
  username: "okabe.rintaro@futuregadgetlab.org",
  name: "Rintaro Okabe",
  localAccountId: "mad-scientist-id",
  idTokenClaims: {
    roles: ["Admin"],
    oid: "mad-scientist-id",
    preferred_username: "hououin.kyouma@futuregadgetlab.org",
    nickname: "Hououin Kyouma"
  },
};
```

### Pipeline Setup
The pipeline is preconfigured on the following setup:
- On Pull Request
  - Check Backend-Unit-Tests, Frontend-Unit-Tests and E2E tests in Parallel
  - Check coverage within those tests __they will fail when coverage is not reached__
  - Output coverage reports as artifacts
- On Merge Main
  - Deploy to development
- On Tag 
  - Deploy to test
- Manually (After Tag)
  - Deploy to prod

If you want to disable the coverage fails, you have to adjust it in the files like described above.

## Azure Setup
Create an empty resource group and make sure that you are at least Contributor of it.
1. Go to your Project's (Env) Resource Group click on Create and Create a User assigned Managed Identity. There is no special setup on this point. Just create it.
2. Add the Managed Identity as Contributor to the Resource Group to enable it deploying resources
3. Assign the Managed Identity as Application Application Admin (Application Developer not worked out) to enable it creating application. This can be tricky a bit as you sometimes cannot assign it via Menu because it only shows users and Applications for that you can 
  - Open the Managed Identity and on Overview page get its __ObjectId__ (not ClientId)
  - Open Azure CLI and type 
      ```powershell
        Get-AzureADDirectoryRole
      ```
  - If it is in the list then get its ObjectId (of "Application Administrator" role) if not you have to assign a user to get it activated
  - Then execute
      ```powershell
        Add-AzureADDirectoryRoleMember -ObjectId '[App Admin Object Id]' -RefObjectId '[User Managed Identity Object Id]'
      ``` 
  - Also assign the "Directory Reader" role in the same way to enable the terraform module `azure_api_roles' query the directory. Or use the `azure_api_roles_static' module where you have to check in the result json into the repository.
      ```powershell
        Add-AzureADDirectoryRoleMember -ObjectId '[Directory Reader Object Id]' -RefObjectId '[User Managed Identity Object Id]'
      ``` 

## Connect Github Setup
The github actions require permissions to create the structure with terraform. Do the following steps to create and assign a ServicePrincipal to that specific Github Project' Environment if necessary.
1. In Azure Open the Managed Identity go to Settings/Federated Credentials and click Add Credential and select the Federated credential scenario "Configure a Github issued token..."
2. Add your Organization/Personal Accountname, enter the repository name and __environment__ name as Entity. Also choose a credential name for it.
3. Click on Add
4. Go to overview Page and save the following IDs from it
  - Client ID
  - Subscription ID
  - Tenant ID (Open JSON View on the top right for that)
5. Go on Github and open you repository and open Settings
6. In Environments select "new environment" and enter the name of the __environment__ you chosen in the federated credential. then click on configure environment.
7. Enter the following Environment __Secrets__ which you saved from the managed identites. The key names have to be exactly like that. The values you got from the federated credential.
  - AZURE_CLIENT_ID=[Client ID]
  - AZURE_SUBSCRIPTION_ID=[Subscription ID]
  - AZURE_TENANT_ID=[Tenant ID]
8. make sure that you have set up the environment name in any job that requires these credentials.
  ```yaml
    jobs:
      terraform:
        environment:
          name: 'dev'
  ```
9. In the jobs where you need them add the with statement to make sure they are provided. The services should usually auto grab them otherwise you can map them.
  ```yaml
      with:
        # auth-type: SERVICE_PRINCIPAL
        client-id: ${{ secrets.AZURE_CLIENT_ID }}
        tenant-id: ${{ secrets.AZURE_TENANT_ID }}
        subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
  ```
10. You are done here. Run the Action and check if it can authorize on azure for it.

## Terraform Azure Storage Setup
When you have a Storage Account for all Terraform states of all projects on your Tenant then create a Container `[projectname_env]` and
1. Check if terraform azurerm backend is configured with use_azuread_auth = true
2. Assign yourself as **Storage Data Contributor** to the container
3. Assign the Github Managed Identity also **Storage Data Contributor** Permissions to the container

## Debugging the app
You need the following Extensions into VS Code
1. Python Debugger
2. Python
3. Pylance

Afterward in __VSCode__ you can 
1. Open your project folder  
2. On the left bar select "Run and Debug"
3. Select Full Stack Debug
4. And simply press __F5__. (It will compile the app and start a debugging session in chrome)
5. Now you can set Breakpoints in each frontend and backend

## Generate a production build (Frontend)
To generate a production compile of the frontend
1. Navigate to frontend folder `cd ./frontend`
2. Type `npm run build`
3. It will create a build into ./__backend__/dist folder where fast-api will start it. `./backend/dist`

## Adding Users to Application and commit requested Permissions
To enable users joining your application you have to do following
1. Go to Azure Portal and Navigate to Entra Id -> Enterprise Applications
2. Select the generated Application (following the terraform vars it is [app_name]-dev - with dashes not underlines)  
3. Go to Manage -> Users and groups
4. Add the users and groups which should have access to the application and select also their Role (in this example its "User" or "Admin"). It will take some while so refresh the page couple of times
5. To enable the requested permissions go to Entra Id - App registrations - All Applications
6. Select the generated Application (following the terraform vars it is [app_name]-dev - with dashes not underlines)  
7. Go to Manage -> API Permissions
8. Click on "Grant admin consent for [Your Tenant Name]" and confirm
9. The users should now be able to log on to your application and only able to navigate within their role.

