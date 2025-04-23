const { ipcRenderer } = require('electron');
const dgram = require('dgram');
const udpClient = dgram.createSocket('udp4');
udpClient.setMaxListeners(20);  // Maksimum dinleyici sayısını artır

let playerName = '';
let playerPosition = { x: 400, y: 300 };
let playerRotation = 0;
let playerHealth = 100;
let bullets = [];
let players = {};
let isDead = false;
const moveSpeed = 5;
const rotationSpeed = 5; // Rotasyon hızı (derece)
const keyState = {};

const serverIp = '192.168.214.212';
const serverPort = 41234;

const gameAreaSize = 800; // Oyun alanı boyutu

function normalizeRotation(rotation) {
    return ((rotation % 360) + 360) % 360;
}

function updatePlayerPosition(x, y, is_shot = false, subtype = "CHANGE_INFO") {
    if (!playerName || isDead) return;  // playerName boş ise veya oyuncu ölmüşse hareket bilgisini gönderme
    playerPosition.x = x;
    playerPosition.y = y;
    const moveData = { playerName, x, y, rotation: playerRotation, health: playerHealth, is_shot, subtype };
    const message = JSON.stringify({ type: "MOVE", data: moveData });
    ipcRenderer.send('log-message', `Sending MOVE message: ${message}`);
    udpClient.send(message, serverPort, serverIp, (err) => {
        if (err) ipcRenderer.send('log-message', `Error sending MOVE message: ${err}`);
    });
}

function sendHeartbeat() {
    if (isDead) return;  // Oyuncu ölmüşse heartbeat gönderme
    const heartbeatData = { playerName, subtype: "HEARTBEAT" };
    const message = JSON.stringify({ type: "MOVE", data: heartbeatData });
    ipcRenderer.send('log-message', `Sending HEARTBEAT message: ${message}`);
    udpClient.send(message, serverPort, serverIp, (err) => {
        if (err) ipcRenderer.send('log-message', `Error sending HEARTBEAT message: ${err}`);
    });
}

function updateOtherPlayerPosition(playerName, x, y, rotation, health) {
    players[playerName] = { x, y, rotation, health };
    const playerElem = document.getElementById(`player-${playerName}`);
    if (playerElem) {
        playerElem.style.left = `${x}px`;
        playerElem.style.top = `${y}px`;
        playerElem.style.transform = `rotate(${rotation}deg)`;
        playerElem.dataset.health = health;
        playerElem.innerText = health; // Sağlık durumunu göstermek için
    } else {
        const newPlayerElem = document.createElement('div');
        newPlayerElem.id = `player-${playerName}`;
        newPlayerElem.className = 'player';
        newPlayerElem.style.position = 'absolute';
        newPlayerElem.style.width = '40px';  // Genişlik ve yükseklik artırıldı
        newPlayerElem.style.height = '40px';
        newPlayerElem.style.backgroundColor = 'blue';
        newPlayerElem.style.left = `${x}px`;
        newPlayerElem.style.top = `${y}px`;
        newPlayerElem.style.transform = `rotate(${rotation}deg)`;
        newPlayerElem.dataset.health = health;
        newPlayerElem.innerText = health; // Sağlık durumunu göstermek için
        document.getElementById('gameArea').appendChild(newPlayerElem);
    }
}

function handleBulletMessage(subtype, data) {
    switch (subtype) {
        case 'ADD_BULLET':
            addBullet(data.x, data.y, data.id);
            break;
        case 'UPDATE_BULLET':
            updateBulletPosition(data.id, data.x, data.y);
            break;
        case 'REMOVE_BULLET':
            removeBullet(data.id);
            break;
    }
}

function addBullet(x, y, id) {
    const bullet = { x, y, id };
    bullets.push(bullet);
    const bulletElem = document.createElement('div');
    bulletElem.id = `bullet-${id}`;
    bulletElem.className = 'bullet';
    bulletElem.style.position = 'absolute';
    bulletElem.style.width = '10px';
    bulletElem.style.height = '10px';
    bulletElem.style.backgroundColor = 'yellow';
    bulletElem.style.borderRadius = '50%';
    bulletElem.style.left = `${x}px`;
    bulletElem.style.top = `${y}px`;
    document.getElementById('gameArea').appendChild(bulletElem);
}

function updateBulletPosition(id, x, y) {
    const bulletElem = document.getElementById(`bullet-${id}`);
    if (bulletElem) {
        bulletElem.style.left = `${x}px`;
        bulletElem.style.top = `${y}px`;
    }
}

function removeBullet(id) {
    const bulletElem = document.getElementById(`bullet-${id}`);
    if (bulletElem) {
        bulletElem.remove();
    }
    ipcRenderer.send('log-message', `Bullet removed: ${id}`);
    bullets = bullets.filter(bullet => bullet.id !== id);
}

function updateScore(playerName, score) {
    const scoreElem = document.getElementById(`score-${playerName}`);
    if (scoreElem) {
        scoreElem.textContent = `Score: ${score}`;
    } else {
        const newScoreElem = document.createElement('div');
        newScoreElem.id = `score-${playerName}`;
        newScoreElem.textContent = `Score: ${score}`;
        document.body.appendChild(newScoreElem);
    }
}

function createGameArea() {
    const gameArea = document.getElementById('gameArea');
    gameArea.style.display = 'block'; // Oyun alanını görünür yap
    const nameForm = document.getElementById('nameForm');
    nameForm.style.display = 'none'; // İsmi girme formunu gizle
}

function showWinnerMessage(winnerName) {
    const overlay = document.createElement('div');
    overlay.id = 'winnerOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.color = 'white';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontSize = '36px';
    overlay.style.zIndex = '1000';
    overlay.innerText = `Winner: ${winnerName}`;
    document.body.appendChild(overlay);
}

document.addEventListener('DOMContentLoaded', () => {
    const nameForm = document.getElementById('nameForm');
    nameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        playerName = document.getElementById('nameInput').value;

        const message = JSON.stringify({ type: "NAME", playerName: playerName });
        udpClient.send(message, serverPort, serverIp, (err) => {
            if (err) ipcRenderer.send('log-message', `Error sending NAME message: ${err}`);
        });

        // Heartbeat gönderim zamanlayıcısını başlat
        setInterval(() => {
            sendHeartbeat();
        }, 1000);
    });

    udpClient.on('message', (msg) => {
        const response = msg.toString();
        ipcRenderer.send('log-message', `Received message: ${response}`);
        const parsedMessage = JSON.parse(response);
        if (parsedMessage.type === 'NAME_TAKEN') {
            alert('This name is already taken. Please choose another one.');
        } else if (parsedMessage.type === 'NAME_ACCEPTED') {
            alert('Name accepted. Proceeding to the game...');
            createGameArea();
            const playerElem = document.createElement('div');
            playerElem.id = `player-${playerName}`;
            playerElem.className = 'player';
            playerElem.style.position = 'absolute';
            playerElem.style.width = '40px';  // Genişlik ve yükseklik artırıldı
            playerElem.style.height = '40px';
            playerElem.style.backgroundColor = 'red';
            playerElem.style.left = `${playerPosition.x}px`;
            playerElem.style.top = `${playerPosition.y}px`;
            playerElem.style.transform = `rotate(${playerRotation}deg)`;
            playerElem.dataset.health = playerHealth;
            playerElem.innerText = playerHealth; // Sağlık durumunu göstermek için
            document.getElementById('gameArea').appendChild(playerElem);
        } else if (parsedMessage.type === 'MOVE') {
            const moveData = parsedMessage.data;
            if (moveData.subtype === 'DELETE_PLAYER') {
                const playerElem = document.getElementById(`player-${moveData.playerName}`);
                if (playerElem) {
                    playerElem.remove();
                }
                delete players[moveData.playerName];
            } else {
                if (moveData.playerName !== playerName) {
                    updateOtherPlayerPosition(moveData.playerName, moveData.x, moveData.y, moveData.rotation, moveData.health);
                } else if (parsedMessage.source === 'server') {
                    updatePlayerPosition(moveData.x, moveData.y); // Kendi nesne bilgisini güncelle
                    playerRotation = moveData.rotation; // Kendi rotasyon bilgisini güncelle
                    playerHealth = moveData.health; // Kendi sağlık bilgisini güncelle

                    // Kendi oyuncu div'inin sağlık bilgisini güncelle
                    const playerElem = document.getElementById(`player-${playerName}`);
                    if (playerElem) {
                        playerElem.dataset.health = playerHealth;
                        playerElem.innerText = playerHealth; // Sağlık durumunu göstermek için
                    }
                }
            }
        } else if (parsedMessage.type === 'SHOOT') {
            const { subtype, data } = parsedMessage;
            handleBulletMessage(subtype, data);
        } else if (parsedMessage.type === 'MARK_PLAYER_DEAD') {
            const playerElem = document.getElementById(`player-${parsedMessage.data.playerName}`);
            if (playerElem) {
                playerElem.style.backgroundColor = 'gray'; // Oyuncu öldüğünde gri renk yap
            }
            if (parsedMessage.data.playerName === playerName) {
                isDead = true; // Kendi oyuncumuz öldüyse kontrolleri kilitle
            }
        } else if (parsedMessage.type === 'WINNER') {
            showWinnerMessage(parsedMessage.playerName);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (!isDead) {
            keyState[event.key] = true;
        }
    });

    document.addEventListener('keyup', (event) => {
        if (!isDead) {
            keyState[event.key] = false;
        }
    });

    function gameLoop() {
        let moved = false;
        if (keyState['w'] && playerPosition.y - moveSpeed >= 0) {
            playerPosition.y -= moveSpeed;
            moved = true;
        }
        if (keyState['a'] && playerPosition.x - moveSpeed >= 0) {
            playerPosition.x -= moveSpeed;
            moved = true;
        }
        if (keyState['s'] && playerPosition.y + moveSpeed + 40 <= gameAreaSize) {
            playerPosition.y += moveSpeed;
            moved = true;
        }
        if (keyState['d'] && playerPosition.x + moveSpeed + 40 <= gameAreaSize) {
            playerPosition.x += moveSpeed;
            moved = true;
        }
        if (keyState['ArrowLeft']) {
            playerRotation -= rotationSpeed;
            playerRotation = normalizeRotation(playerRotation);
            moved = true;
        }
        if (keyState['ArrowRight']) {
            playerRotation += rotationSpeed;
            playerRotation = normalizeRotation(playerRotation);
            moved = true;
        }
        if (moved) {
            updatePlayerPosition(playerPosition.x, playerPosition.y);
            const playerElem = document.getElementById(`player-${playerName}`);
            if (playerElem) {
                playerElem.style.left = `${playerPosition.x}px`;
                playerElem.style.top = `${playerPosition.y}px`;
                playerElem.style.transform = `rotate(${playerRotation}deg)`;
            }
        }
        requestAnimationFrame(gameLoop);
    }

    gameLoop();
});

document.addEventListener('click', (event) => {
    if (!isDead) {
        updatePlayerPosition(playerPosition.x, playerPosition.y, true);
    }
});