FROM node:18-slim

# Install Python and yt-dlp dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg python3-venv curl && \
    apt-get clean

# Create virtual environment for python
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install yt-dlp using pip in the virtual environment
RUN pip install yt-dlp

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Create downloads directory
RUN mkdir -p downloads

# Expose port
EXPOSE 3000

# Start command
CMD [ "npm", "start" ]
