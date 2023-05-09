const http = require("http");
const https = require("https");
const fs = require("fs");
const querystring = require("querystring");
const crypto = require("crypto");

const server = http.createServer();
const port = 3000;
const giphy_auth_key = require("./auth/giphy_key.json").auth_key;
const dropbox_auth_keys = require("./auth/dropbox_key.json");

let task_states = []; //array which holds client info

server.on("request", connection_handler);
server.on("listening", listen_handler);
server.listen(port);

function listen_handler(){
    console.log(`Now listening on port ${port}`);
}

function connection_handler(req, res){
    console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);

    if(req.url === "/"){
        const landingPage = fs.createReadStream("./html/index.html");
        res.writeHead(200, {"Content-Type" : "text/html"});
        landingPage.pipe(res);
    }else if(req.url.startsWith("/search")){
        const inputURL = new URL(req.url, `http://localhost:${port}/`);
        //create session at this point
        const state = crypto.randomBytes(20).toString("hex");
        const searched_gif = inputURL.searchParams.get("gif");
        task_states.push({state, searched_gif});

        //check if searched gif is already in downloaded folder
        let cached = false;
        const cached_gifs = fs.readdirSync("./downloaded");
        console.log(cached_gifs);
        for(let i = 0; i < cached_gifs.length; i++){
            if(cached_gifs[i] === `${searched_gif}.gif`){
                redirect_to_dropbox(res, state);
                cached = true;
            }
        }
        giphy_request({response: res, searched_gif: searched_gif, state: state, cached: cached});
    }else if(req.url.startsWith("/received_code")){
        const url = new URL(req.url, "http://localhost:3000/");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        //when auth is granted (no error) proceed
        if(!url.searchParams.get("error")){
            let task_state = task_states.find(task_state => task_state.state === state);
            if(code === undefined || state === undefined || task_state === undefined){
                bad_request_error(res);
                return;
            }
            get_user_token({response: res, gif_dir: `./downloaded/${task_state.searched_gif}`, code: code});
        }else{
            //otherwise redirect to main + remove gif + remove session
            res.writeHead(302, {Location: "/"});
            res.end();
        }
    }else if(req.url === "/success"){
        const successPage = fs.createReadStream("./html/success.html");
        res.writeHead(200, {"Content-Type": "text/html"});
        successPage.pipe(res);
    }else if(req.url === "/dropbox"){
        res.writeHead(302, {Location: "https://www.dropbox.com/home/Apps/GIPHYUploader/downloaded"});
        res.end();
    }else if(req.url === "/html/error400.html"){
        const errorPage = fs.createReadStream("./html/error400.html");
        res.writeHead(400, {"Content-Type" : "text/html"});
        errorPage.pipe(res); 
    }else{
        const errorPage = fs.createReadStream("./html/error404.html");
        res.writeHead(404, {"Content-Type" : "text/html"});
        errorPage.pipe(res);
    }
}

//will GET top gif result from giphy
function giphy_request(obj){
    if(obj.cached === true) return;
    const search_endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${giphy_auth_key}&q=${obj.searched_gif}`;
    let gif_request = https.request(search_endpoint, (res) => {stream_to_message(res, download_gif_request, obj.response, obj.state, obj.searched_gif)});
    gif_request.end();
}


function download_gif_request(stringJSON, response, state, searched_gif){
    const giphyJSON = JSON.parse(stringJSON);
    
    if(giphyJSON.data.length === 0){
        bad_request_error(response);
        return;
    }
    
    const gif_source_url = "https://i." + (giphyJSON.data[0].images.original.url).substring(15); //creates actual source URL
    const gif_dest = (`./downloaded/${searched_gif}.gif`);
    const gif_file = fs.createWriteStream(gif_dest);
    
    const gif_download_request = https.request(gif_source_url, (gif_response) => {
        gif_response.pipe(gif_file);
    });
    gif_download_request.end(()=>{
        redirect_to_dropbox(response, state);
    }); 
}

function redirect_to_dropbox(response, state){
    console.log("redirecting...")
    const oauth_endpoint = "https://www.dropbox.com/oauth2/authorize";
    //querystring builds the query part without having to manually build URL as part of the oauth_endpoint const
    const uri = querystring.stringify({client_id: dropbox_auth_keys.App_Key, response_type: "code", redirect_uri:"http://localhost:3000/received_code", state: state});
    response.writeHead(302, {Location: `${oauth_endpoint}?${uri}`});
    response.end();
}

function get_user_token(info){
    //info is an object with 3 parts: code, gif_dir, response
    const token_endpoint = "https://api.dropboxapi.com/oauth2/token";
    const post_data = querystring.stringify({
        grant_type: "authorization_code",
        code: info.code,    
        client_id: dropbox_auth_keys.App_Key,
        client_secret: dropbox_auth_keys.App_Secret,
        redirect_uri: "http://localhost:3000/received_code"
    });
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }
    const token_request = https.request(token_endpoint, options, (token_response) => { stream_to_message(token_response, upload_to_dropbox, info.gif_dir, info.response) }).end(post_data);
    token_request.on("error", (err) => {
        console.error(err);
        bad_request_error(info.res);
    })
}

function upload_to_dropbox(stringJSON, gif_dir, response){
    const user_token = JSON.parse(stringJSON).access_token;
    if(user_token.error){
        bad_request_error(response);
        return;
    }
    
    const upload_endpoint = "https://content.dropboxapi.com/2/files/upload";
    const api_arg = Buffer.from(JSON.stringify({
        "autorename": false,
        "mode": "add",
        "mute": false,
        "path": `${gif_dir.substring(1)}.gif`,
        "strict_conflict": false
    }), "utf-8");
    const options = {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${user_token}`,
            "Dropbox-API-Arg": api_arg,
            "Content-Type": "application/octet-stream"
        }    
    };
    fs.readFile(`${gif_dir}.gif`, (err, data) => {
        if(err){
            console.error(err);
            return;
        }
        const upload_request = https.request(upload_endpoint, options, (upload_response) => { stream_to_message(upload_response, receive_upload_response, response, gif_dir) })
            .end(data);
    });
}

function receive_upload_response(body, response, gif_dir){
    const results = JSON.parse(body);
    console.log(results);
    console.log("Uploaded GIF");
    response.writeHead(302, {Location: "/success"});
    response.end();
}

function bad_request_error(response){
    response.writeHead(302, {Location: "./html/error404.html"});
    response.end();
}

function stream_to_message(stream, callback, ...args){
    //...args here is an array of arguments
    let body = "";
    stream.on("data", (chunk) => body += chunk);
    stream.on("end", () => callback(body, ...args));
}