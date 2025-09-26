import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

const socket = io();
const canvas = document.getElementById('game-window');
const context = canvas.getContext('2d');

// Game state
let players = {};
let collectibles = [];
let currentPlayer = null;

// Canvas setup
canvas.width = 640;
canvas.height = 480;

// Socket event handlers
socket.on('init', (data) => {
  console.log('Game initialized');
  players = data.players;
  collectibles = data.collectibles;
  currentPlayer = new Player(data.players[data.id]);
  draw();
});

socket.on('new-player', (playerData) => {
  console.log('New player joined:', playerData.id);
  players[playerData.id] = playerData;
  draw();
});

socket.on('player-update', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].score = data.score;
    draw();
  }
});

socket.on('player-disconnect', (playerId) => {
  console.log('Player disconnected:', playerId);
  delete players[playerId];
  draw();
});

socket.on('collectible-update', (data) => {
  // Remove collected item
  collectibles = collectibles.filter(item => item.id !== data.collected);
  
  // Add new collectible
  collectibles.push(data.new);
  
  // Update player score
  if (players[data.player.id]) {
    players[data.player.id].score = data.player.score;
  }
  
  // Update current player if it's them
  if (data.player.id === socket.id && currentPlayer) {
    currentPlayer.score = data.player.score;
  }
  
  draw();
});

// Input handling
const keys = {};

document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  handleMovement();
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

function handleMovement() {
  if (!currentPlayer) return;
  
  const speed = 5;
  let moved = false;
  
  if (keys['w'] || keys['arrowup']) {
    socket.emit('movement', { direction: 'up', speed: speed });
    currentPlayer.movePlayer('up', speed);
    moved = true;
  }
  if (keys['s'] || keys['arrowdown']) {
    socket.emit('movement', { direction: 'down', speed: speed });
    currentPlayer.movePlayer('down', speed);
    moved = true;
  }
  if (keys['a'] || keys['arrowleft']) {
    socket.emit('movement', { direction: 'left', speed: speed });
    currentPlayer.movePlayer('left', speed);
    moved = true;
  }
  if (keys['d'] || keys['arrowright']) {
    socket.emit('movement', { direction: 'right', speed: speed });
    currentPlayer.movePlayer('right', speed);
    moved = true;
  }
  
  if (moved) {
    // Apply boundary constraints on client side too
    currentPlayer.x = Math.max(20, Math.min(620, currentPlayer.x));
    currentPlayer.y = Math.max(20, Math.min(460, currentPlayer.y));
    
    // Update local player data
    if (players[socket.id]) {
      players[socket.id].x = currentPlayer.x;
      players[socket.id].y = currentPlayer.y;
    }
    
    draw();
  }
}

// Drawing functions
function draw() {
  // Clear canvas
  context.fillStyle = '#220';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw collectibles
  context.fillStyle = '#FFD700';
  collectibles.forEach(collectible => {
    context.beginPath();
    context.arc(collectible.x, collectible.y, 10, 0, 2 * Math.PI);
    context.fill();
    
    // Draw value text
    context.fillStyle = '#FFF';
    context.font = '12px Arial';
    context.textAlign = 'center';
    context.fillText(collectible.value.toString(), collectible.x, collectible.y - 15);
    context.fillStyle = '#FFD700';
  });
  
  // Draw players
  Object.values(players).forEach(player => {
    // Player color
    const isCurrentPlayer = currentPlayer && player.id === socket.id;
    context.fillStyle = isCurrentPlayer ? '#00FF00' : '#FF0000';
    
    // Draw player as circle
    context.beginPath();
    context.arc(player.x, player.y, 15, 0, 2 * Math.PI);
    context.fill();
    
    // Draw player ID and score
    context.fillStyle = '#FFF';
    context.font = '10px Arial';
    context.textAlign = 'center';
    context.fillText(`${player.id.substring(0, 6)}`, player.x, player.y - 20);
    context.fillText(`Score: ${player.score}`, player.x, player.y + 30);
  });
  
  // Draw current player's rank
  if (currentPlayer && Object.keys(players).length > 0) {
    const playersArray = Object.values(players);
    const rank = currentPlayer.calculateRank(playersArray);
    
    context.fillStyle = '#FFF';
    context.font = '16px Arial';
    context.textAlign = 'left';
    context.fillText(rank, 10, 30);
    context.fillText(`Your Score: ${currentPlayer.score}`, 10, 50);
  }
  
  // Draw instructions
  context.fillStyle = '#FFF';
  context.font = '12px Arial';
  context.textAlign = 'left';
  context.fillText('Use WASD or Arrow Keys to move', 10, canvas.height - 40);
  context.fillText('Collect gold items to increase your score!', 10, canvas.height - 20);
}

// Initial draw
draw();
