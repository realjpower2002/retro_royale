let width = 600;
let height = 600;

var current_state = new fruitGame();

let global_port = 3128;
var express = require('express');	// include express.js
var server = express(); // a local instance of express
var wsServer = require('express-ws')(server); // instance of the websocket server
var clients = new Array;  // list of client connections:
var clients_hash = new Array;

// serve static files from /public:
server.use('/', express.static('public'));

// this runs after the server successfully starts:
function serverStart() {
  var port = this.address().port;
  console.log('Server listening on port ' + port);
  console.log("Initializing game");
  current_state.setup();
}

function handleClient(thisClient, request) {
  console.log("New Connection");        // you have a new client
  clients.push(thisClient);    // add this client to the clients array

  current_state.user_connected(clients.indexOf(thisClient));

  function endClient() {                        //Triggers on a client disconnect
    var position = clients.indexOf(thisClient); //Gets clients position in array
    clients.splice(position, 1);                //Removes client from global client array
    current_state.user_disconnected(position);  //Triggers current_state's user disconnect function.
    console.log("connection closed, client: "+position);
  }

  function clientResponse(data) {             //Activates when a client sends data in.
    var lines = data.split("\n");             //Packets may contain multiple commands, separated by newline
    var index = clients.indexOf(thisClient);  //grabs the index of the client that sent it in
    for (let i in lines) {                    //Processes each individual command in the packet
      var line_pieces = lines[i].split(":");  //Commands are formatted as flag:data, flag indicating what to activate.
      var flag = line_pieces[0],  
          message = null;
      if (line_pieces.length > 1) {           //Some commands are just a flag, this accounts for that.
        message = line_pieces[1];             
      }
      current_state.read_network_data(flag, message, index);  //Passes the flag, message, and sender id to current_state's network trigger.
    }
  }

  // set up client event listeners:
  thisClient.on('message', clientResponse);
  thisClient.on('close', endClient);

}

function broadcast(data) {  //Send a message to all connected clients
  for (let c in clients) {
    clients[c].send(data);
  }
}

function broadcast_exclusive(data, excluded_clients_array) {  //Send a message to all clients excluding a passed array.
  if (excluded_clients_array.length > 1) {
    for (let c in clients) { if (!(excluded_clients_array.includes(c))) { clients[c].send(data); } }
  }
  else {  //For whatever reason javascript treats an array of 1 as an element, so array.includes doesn't work. This accounts for that.
    for (let c in clients) { if (c != excluded_clients_array) { clients[c].send(data); } }
  }
}

server.listen(process.env.PORT || global_port, serverStart);  //start the server
server.ws('/', handleClient);                                 //listen for ws connections


class game_1_player {
  constructor(x, y, face) {
    this.sx = 0;
    this.x = x;
    this.y = y;
    this.move = 0;
    this.speed = 5;
    this.facing = face; // use 4, maybe 8 later. 0, 1, 2, 3 for EWNS respectively
    this.fruit_holding = 0;
    this.fruit_held_id = 0;
  }

  make_data(player_index){
    var string_make = "pos_player:"+player_index+","+this.x+","+this.y+","+this.move+","+
                      this.speed+","+this.facing+","+this.fruit_holding+","+this.fruit_held_id;
    return string_make;
  }

  update_data(sprite, x, y, move, speed, facing, fruit_holding, fruit_id){
    if (x != null) { this.x = x; }
    if (y != null) { this.y = y; }
    if (move != null) { this.move = move; }
    if (speed != null) { this.speed = speed; }
    if (facing != null) { this.facing = facing; }
    if (fruit_holding != null) { this.fruit_holding = fruit_holding; }
    if (fruit_id != null) { this.fruit_held_id = fruit_id; }
  }
}

class game_1_fruit {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = ~~size;
    this.held = 0
    this.scored = 0;
    this.player_holding_id = 0;
    if ((size < 5) || (size > 15)) {
      size = Math.min(15, Math.max(0, 5));
    }
  }

  update_position(x, y) {
    this.x = x;
    this.y = y;
  }

  check_grabbed(x, y, player_index) {
    if (this.held || this.scored) {
      return;
    }
    var player_x_norm = Math.abs(x - this.x),
        player_y_norm = Math.abs(y - this.y);
    if ((player_x_norm <= 40) & (player_y_norm <= 40)) {
      this.held = 1;
      this.player_holding_id = player_index;
    }
  }

  drop() {
    this.held = 0;
  }

  update_data(x, y, size, held, scored, player_holding_id) {
    if (x != null) {this.x = x;}
    if (y != null) {this.y = y;}
    if (size != null) {this.size = size;}
    if (held != null) {this.held = held;}
    if (scored != null) {this.scored = scored;}
    if (player_holding_id != null) {this.player_holding_id = player_holding_id;}
  }

  make_data(index) {
    var str_make = "pos_fruit:"+index+","+this.x+","+this.y+","+
                    this.size+","+this.held+","+this.scored+","+this.player_holding_id;
    return str_make;
  }
}

class game_1_endzone {
  constructor(x1, x2, y1, y2) {
    this.x = x1;
    this.y = y1;
    this.width = x2 - x1;
    this.height = y2 - y1;  
    this.score = 0;
  }

  draw(){
    fill(255, 204, 0);
    rect(this.x, this.y, this.width, this.height);

    fill(0, 0, 0);
    text(str(this.score), this.width/2+this.x, this.height/2+this.y);
  }

  check_placement(x, y){
    x -= this.x;
    y -= this.y;
    if ((x >= 0) && (x <= this.width) && (y >= 0) && (y <= this.height)) {
      return true;
    }
    return false;
  }
}

function fruitGame() {
  this.setup = function() {
    this.fruits_count = 50;
    this.players = [];
    this.fruits = [];
    this.endzones = [];
    this.game_active = false;
    this.start_time = 60.000;
    this.current_time = this.start_time;
    for (i=0; i < this.fruits_count; i++) {
      this.fruits[i] = new game_1_fruit(width*Math.random(), height*Math.random(), 3+Math.random()*12);
    }
    this.endzones[0] = new game_1_endzone(0, 100, 200, 400);
    this.endzones[1] = new game_1_endzone(500, 600, 200, 400);
  }
  
  this.read_network_data = function(flag, message, usr_id) {
    console.log(flag+":"+message);
    if (flag == "connected") {
      this.user_connected(usr_id);
    } else if (flag == "my_pos") {
      this.read_in_player_position(usr_id+","+message);
      broadcast_exclusive(this.players[usr_id].make_data(usr_id), [usr_id]);
    } else if (flag == "pos_fruit") {
      var fruit_id = this.read_in_fruit_position(message);
      broadcast_exclusive(this.fruits[usr_id].make_data(fruit_id), [usr_id]);
    }
  }

  this.user_connected = function(usr_id) {
    clients[usr_id].send("connected");
    var string_make = "player_count:" + clients.length + "\n" +
                      "assigned_id:" + usr_id + "\n";
    this.players[usr_id] = new game_1_player(600*Math.random(), 600*Math.random(), 1);
    broadcast_exclusive("new_player:"+usr_id+"\n"+this.players[usr_id].make_data(usr_id), [usr_id]);
    for (let i in this.fruits) {
      string_make += this.fruits[i].make_data(i)+"\n";
    }
    
    for (let i in this.players) {
      string_make += "new_player:"+i+"\n";
      string_make += this.players[i].make_data(i)+"\n";
    }
    clients[usr_id].send(string_make);
  }

  this.user_disconnected = function(usr_id) {
    broadcast("rmv_player:"+usr_id);
    if (this.players[usr_id].fruit_holding == 1) {
      this.fruits[this.players[usr_id].fruit_held_id].drop();
    } 
    this.players.splice(usr_id, 1);
  }

  this.read_in_player_position = function(data_string) {
    var p_vals_string = data_string.split(",");
    var p_vals = [null, null, null, null, null, null, null, null];
    var ints = [0, 3, 5, 6, 7], floats = [1, 2, 4];
    for (let i in ints)     { p_vals[ints[i]] = parseInt(p_vals_string[ints[i]])}
    for (let i in floats)   { p_vals[floats[i]] = parseFloat(p_vals_string[floats[i]]); }
    this.players[p_vals[0]].update_data(null, p_vals[1], p_vals[2], p_vals[3], p_vals[4], p_vals[5], p_vals[6], p_vals[7]);
  }

  this.read_in_fruit_position = function(data_string) {
    var p_vals_string = data_string.split(",");
    var p_vals = [null, null, null, null, null, null, null];
    var ints = [0, 3, 4, 5, 6], floats = [1, 2];
    for (let i in ints)     { p_vals[ints[i]] = parseInt(p_vals_string[ints[i]])}
    for (let i in floats)   { p_vals[floats[i]] = parseFloat(p_vals_string[floats[i]]); }
    this.fruits[p_vals[0]].update_data(p_vals[1], p_vals[2], p_vals[3], p_vals[4], p_vals[5], p_vals[6]);
    return p_vals[0];
  }
}
