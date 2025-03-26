# Entra Id Web Auth Reference
The web app provides a authentication to Azure Entra ID and role checking and full automatic terraform resource deployment. It is useful to build admin pages out of scratch. You do not have to setup anything on specific resources. Setup like env variables becomes obsolete here. Just create the resource group, connect github to it, connect terraform states and deploy. 
## Purpose detail
This project fulfills the following requirements.
### From current project [EntraId-Web-Auth-Reference]
https://github.com/kstrassheim/entraid-web-auth-reference 
- Create the whole infrastructure with terraform
- Provide all required settings for the environment via terraform output
- Build and connect all the applications according to the terraform config for each environment. __Without manual setup of environment variables__
- Deploy and connect to the Authentication automatically
- In terraform you can select roles by their names and provide them like that to the applications. thanks to the custom terraform modules inside the project.
- Three (3) step approval process pipeline
  - On Merge completed main - Deploy dev
  - On Tag/Release - Deploy to test
  - On Test deployed (and approved) - Deploy to prod - (Environment has to be set as protected for approval)

### From derived project [FastAPI-Reference]
https://github.com/kstrassheim/fastapi-reference
- Quick to initialize
- Debug with breakpoints of Frontend and Backend and just in time compiler
- Debug by starting F5 in VSCode (Starting chrome also)
- Deployment of a productive version with precompiled frontend server

## Prerequisites
Here are the prerequisites that you have to install before running the app
1. The app requires python3 to be installed on the machine with venv. To install it on on Ubuntu (WSL) just type. On Windows just install from windows store https://apps.microsoft.com/detail/9PNRBTZXMB4Z?hl=en-us&gl=CH&ocid=pdpshare. 
```sh
sudo apt update
sudo apt install python3 python3-venv python3-pip
```
2. Then clone the repository
3. Go into the project folder and run init script (for detail read that script)

On linux
```sh
./init.sh
```
On Windows
```bash
./init.ps1
```
4. Make sure the name (venv) username appears in the console 
5. Download and install VSCode Python Plugins for debugging experience.
6. In VSCode go to Debug Settings and select "Full Stack Debug"
7. Press key F5 to run the project which should start with a new browser and show you the page

## Azure Setup
Create an empty resource group and make sure that you are at least Contributor of it.
1. Go to your Project's (Env) Resouce Group click on Create and Create a User assigned Managed Identity. There is no special setup on this point. Just create it.
2. Add the Managed Identity as Contributor to the Resource Group to enable it deploying resources
3. Assign the Managed Identity as Application Application Admin (Application Developer not worked out) to enable it creating application. This can be tricky a bit as you sometimes cannot assign it via Menu because it only shows users and Applications for that you can 
  - Open the Manged Identity and on Overview page get its __ObjectId__ (not ClientId)
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
The github actions require permissions to create the structure with terraform. Do the following steps to create and assign a ServicePricipal to that specific Github Project' Environment if neccessary.
1. In Azure Open the Managed Identity goto Settings/Federated Credentials and click Add Credential and select the Federated credential scenario "Configure a Github issued token..."
2. Add your Organization/Personal Accountname, enter the repository name and __environment__ name as Entity. Also choose a credential name for it.
3. Click on Add
4. Go to overview Page and save the following IDs from it
  - Client ID
  - Subcription ID
  - Tenant ID (Open JSON View on the top right for that)
5. Go on Github and open you repository and open Settings
6. In Environments select "new environment" and enter the name of the __environment__ you choosen in the federated credential. then click on configure environment.
7. Enter the following Environment __Secrets__ which you saved from the managed identites. The key names have to be exactly like that. The values you got from the federated credential.
  - AZURE_CLIENT_ID=[Client ID]
  - AZURE_SUBSCRIPTION_ID=[Subcription ID]
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
11. You are done here. Run the Action and check if it can authorize on azure for it.
## Terraform Azure Storage Setup
When you have a Storage Account for all Terraform states of all projects on your Tenant then create a Container `[projectname_env]` and
1. Check if terraform azurerm backend is configured with use_azuread_auth = true
2. Assign yourself as **Storage Data Contributor** to the container
3. Assign the Github Managed Identity also **Storage Data Contributor** Permissions to the container

## Terraform Local Setup
You have to set the following variables in the terraform var and tfvar files to attach the terraform installation to you project.
### terraform_vars.tf
The following 2 variables are very important to attach because the application 
- __app_name__ - the short name of the application - many namings in terraform are derived by this
- __resource_group_name__ - the resource group where to deploy the resources to
- __deployment_user_managed_identity_name__ - this is the name of the deployment user/managed identity which you generated before.
Other settings are not that important as the 
### terraform_vars_test.tfvars and terraform_vars_prod.tfvars
This are the variable sets for the test and prod environment which the pipeline will take. The app_name does not have to be changed here as it has already environment in naming but you have to set.
- __deployment_user_managed_identity_name__ - this is the name of the deployment user/managed identity which the pipeline uses to create the azure 
- __resource_group_name__ - the resource group where to deploy the resources toresources. It has to be set here because terraform has to set this user as owner of the resources to allow changing them
### other variables (Optional)
The app is fully capable to run in Azure Free Plan but if you require more performance you can change these variables whether in var file (Default or in the specific environment file)
- web_plan_sku - "F1", "B1" ... will define the web plans for azure app services for more information about the performance and costs you can check this page https://azure.microsoft.com/en-us/pricing/details/app-service/windows/
- web_instances_count - The compute instances used for the plan. Per default its 1.
The env variable you should not touch unless you really want to change the naming everywhere.
## Terraform deployment
When you have set up everything then terraform will do the whole deployment of the resources and the web application. 
### Architecture
Here is the simple architecture description
#### ./backend
Here is the python backend located which is build with simple FastAPI Framework
#### ./frontend
Here is the frontend located which is build with Vite was just slightly modified in `vite.config.js` to output the Dist Build to Backend. This is now build with React but you are free to running the following command from the root folder to setup your own framework with it. 
```sh
npm create vite frontend
```
__Dont forget to add the following lines to `./frontend/vite.config.js` into `export default defineConfig({})` block or it will not run in production.__
```json
  base: "/",
  // Put the dist folder into the backend to enable easier deployment
  build: {
    outDir: '../backend/dist',
    emptyOutDir: true, // also necessary
  }
})
```
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
1. Goto Azure Portal and Navigate to Entra Id -> Enterprise Applications
2. Select the generated Application (following ther terraform vars it is [app_name]-dev - with dashed not undelines)  
3. Goto Manage -> Users and groups
4. Add the users and groups which should have access to the applcation and select also their Role (in this example its "User" or "Admin"). It will take some while so refresh the page couple of times
5. To enable the requested permissions goto Entra Id - App registrations - All Applications
6. Select the Select the generated Application (following ther terraform vars it is [app_name]-dev - with dashed not undelines)  
7. Goto Mange -> API Permissions
8. Click on "Grant admin consent for [Your Tenant Name]" and confirm
9. The users should not be able to logon to you application and only able to navigate within their role.

