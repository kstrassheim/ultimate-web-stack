#!/usr/bin/env bash
#TODO check for az login
echo -e "\033[34mInitializing Frontend\033[0m"
cd frontend
npm install
echo -e "\033[34mInitializing Backend\033[0m"
cd ../
# Ensure uv is available
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
# backend/requirements.txt is the generated, hashed lock produced by
#     uv pip compile requirements.in --universal --generate-hashes \
#         --python-version 3.12 -o requirements.txt
# (see backend/requirements.in for the hand-edited direct-dependency selector).
uv venv backend/venv --python 3.12
VIRTUAL_ENV="$PWD/backend/venv" uv pip sync ./backend/requirements.txt

echo -e "\033[34mInitializing Terraform\033[0m"
terraform init
./apply.sh

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