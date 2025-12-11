.PHONY: all build dev install clean

IMAGE_NAME := leex2019/garage-webui
TAG := latest

all: install build

install:
	npm install

dev:
	npm run dev

build:
	docker build -t $(IMAGE_NAME):$(TAG) .

clean:
	rm -rf .next node_modules
