#!/usr/bin/env sh

set -eu

# install node & yarn
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
. "$HOME/.nvm/nvm.sh"
nvm install 24
nvm use 24

npm install -g corepack
corepack enable

# install git if necessary
xcode-select --install
sudo xcodebuild -license accept

git clone https://github.com/Outsharp/alph-bot
cd alph-bot

# install deps
yarn

# ready to run
