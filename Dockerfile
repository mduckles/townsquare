FROM node:22

# Set the working directory in the container
WORKDIR /app

ADD . /app

# Install http-server globally
RUN npm install -g http-server

# Make port 8080 available to the world outside this container
EXPOSE 8083

# Run http-server when the container launches
CMD ["http-server", "dist", "-p", "8083"]

RUN 

