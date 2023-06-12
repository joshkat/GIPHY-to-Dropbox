# GIPHY-to-Dropbox

This is a simple Node.js server application that utilizes the built-in `http` package to create a server which takes the top result of the given query from GIPHY and uploads that to a folder in the users Dropbox.

## Installation

Before running the application, make sure you have Node.js installed on your system. You can download it from the official Node.js website: [https://nodejs.org](https://nodejs.org)

1. Clone this repository or download the source code.
2. Open a terminal window and navigate to the project directory.
3. Create the two files **dropbox_key.json** and **giphy_key.json** make them look as follows

```javascript
//giphy_key.json
{
  "auth_key":"YOUR GIPHY AUTH KEY"
}
```

```javascript
//dropbox_key.json
{
    "App_Key":"YOUR DROPBOX APP KEY",
    "App_Secret":"YOUR DROPBOX APP SECRET"
}
```
4. Assuming you have node installed on your machine within the same directory type
```bash
node server.js
```
Once the server is running, you can access it by navigating to [http://localhost:3000](http://localhost:3000) in your web browser.

## Configuration

By default, the server listens on port 3000. If you want to change the port, you can modify the `PORT` constant in the `server.js` file.

## Routes

The server defines the following routes:

- `/`: Displays a home page with an input for a GIF.
- `/search`: Preformed after user submits form to GET GIF from GIPHY
- `/received_code`: Redirect page after user has authenticated Dropbox
- `/success`: Displays success message

You can modify the route handlers in the `server.js` file to add your own functionality or create new routes within the ```connection_handler``` function.

