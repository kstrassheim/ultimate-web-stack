#TODO check for az login
echo -e "\033[34mInitializing Frontend\033[0m"
cd frontend
npm install
echo -e "\033[34mInitializing Backend\033[0m"
cd ../
python3 -m venv backend/venv
backend/venv/bin/pip install -r ./backend/requirements.txt

echo -e "\033[34mInitializing Terraform\033[0m"
terraform init
./terraform_apply.sh

#!/usr/bin/env bash
# Check if the virtual environment exists
cd backend
if [ ! -d "venv" ] || [ ! -f "venv/bin/activate" ]; then
    echo "Virtual environment 'venv' not found. Please create one first."
    exit 1
fi

# Activate the virtual environment
source "venv/bin/activate"

# Launch an interactive shell with the virtualenv active
echo -e "\033[34mActivating backend\033[0m .. (type 'exit' to quit)"
bash --rcfile <(echo "source $PWD/venv/bin/activate && cd ../" && cd ../) -i