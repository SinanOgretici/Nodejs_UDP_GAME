const dgram = require('dgram');
const udpServer = dgram.createSocket('udp4');

let players = [];
let bullets = [];
let bulletIdCounter = 0;
const bulletSpeed = 10; // Mermi hızı
const bulletLifetime = 2000; // Mermi ömrü (ms)
const collisionCheckInterval = 10; // Çarpışma kontrol süresi (ms)

function normalizeRotation(rotation) {
    return ((rotation % 360) + 360) % 360;
}

udpServer.on('message', (msg, rinfo) => {
    let message = msg.toString();
    console.log(`Received message: ${message}`);

    try {
        let parsedMessage = JSON.parse(message);
        if (parsedMessage.type === "NAME") {
            let playerName = parsedMessage.playerName;
            if (players.some(player => player.name === playerName)) {
                udpServer.send(JSON.stringify({ type: "NAME_TAKEN" }), rinfo.port, rinfo.address);
            } else {
                players.push({ name: playerName, address: rinfo.address, port: rinfo.port, score: 0, x: 400, y: 300, rotation: 0, health: 100, lastHeartbeat: Date.now(), isDead: false });
                udpServer.send(JSON.stringify({ type: "NAME_ACCEPTED" }), rinfo.port, rinfo.address);
            }
        } else if (parsedMessage.type === "MOVE") {
            let moveData = parsedMessage.data;
            moveData.rotation = normalizeRotation(moveData.rotation);
            let player = players.find(p => p.name === moveData.playerName);
            if (player) {
                if (moveData.subtype === "HEARTBEAT") {
                    player.lastHeartbeat = Date.now();
                } else if (moveData.subtype === "CHANGE_INFO") {
                    player.x = moveData.x;
                    player.y = moveData.y;
                    player.rotation = moveData.rotation;
                    player.health = moveData.health;
                    broadcastMessage(JSON.stringify({ type: "MOVE", source: "client", data: moveData }));

                    if (moveData.is_shot) {
                        const bulletId = bulletIdCounter++;
                        const bullet = {
                            id: bulletId,
                            x: moveData.x + 20 * Math.cos(moveData.rotation * Math.PI / 180), // Merminin ön tarafta oluşturulması
                            y: moveData.y + 20 * Math.sin(moveData.rotation * Math.PI / 180),
                            direction: { x: Math.cos(moveData.rotation * Math.PI / 180), y: Math.sin(moveData.rotation * Math.PI / 180) },
                            playerName: moveData.playerName,
                            createdTime: Date.now()
                        };
                        bullets.push(bullet);
                        console.log(`Bullet created: ${JSON.stringify(bullet)}`);
                        broadcastMessage(JSON.stringify({ type: "SHOOT", subtype: "ADD_BULLET", data: bullet }));
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error parsing message:", error);
        console.error("Message received:", message);
    }
});

function broadcastMessage(message) {
    players.forEach(player => {
        udpServer.send(message, player.port, player.address);
    });
}

function updateBullets() {
    const currentTime = Date.now();
    bullets.forEach((bullet, index) => {
        bullet.x += bullet.direction.x * bulletSpeed;
        bullet.y += bullet.direction.y * bulletSpeed;
        console.log(`Bullet updated: ${JSON.stringify(bullet)}`);
        if (currentTime - bullet.createdTime > bulletLifetime) {
            console.log(`Bullet removed: ${bullet.id}`);
            broadcastMessage(JSON.stringify({ type: "SHOOT", subtype: "REMOVE_BULLET", data: { id: bullet.id } }));
            bullets.splice(index, 1);
        } else {
            broadcastMessage(JSON.stringify({ type: "SHOOT", subtype: "UPDATE_BULLET", data: bullet }));
        }
    });
}

function checkCollisions() {
    bullets.forEach((bullet, bulletIndex) => {
        players.forEach((player, playerIndex) => {
            if (bullet.playerName !== player.name) {
                const dx = bullet.x - player.x;
                const dy = bullet.y - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 20) { // Çarpışma mesafesi (20px)
                    console.log(`Collision detected: Bullet ${bullet.id} with Player ${player.name}`);
                    player.health -= 10;
                    if (player.health <= 0) {
                        player.health = 0; // Sağlık 0'ın altına inemez
                        player.isDead = true;
                        broadcastMessage(JSON.stringify({ type: "MARK_PLAYER_DEAD", source: "server", data: { playerName: player.name } }));
                        if (players.filter(p => !p.isDead).length === 1) {
                            broadcastMessage(JSON.stringify({ type: "WINNER", playerName: players.find(p => !p.isDead).name }));
                            // Oyun durdurma işlemleri burada yapılabilir
                        }
                    } else {
                        const moveData = {
                            playerName: player.name,
                            x: player.x,
                            y: player.y,
                            rotation: player.rotation,
                            health: player.health,
                            is_shot: false, // Çarpışma anında is_shot false olacak
                            subtype: "CHANGE_INFO"
                        };
                        broadcastMessage(JSON.stringify({ type: "MOVE", source: "server", data: moveData }));
                    }
                    broadcastMessage(JSON.stringify({ type: "SHOOT", subtype: "REMOVE_BULLET", data: { id: bullet.id } }));
                    bullets.splice(bulletIndex, 1);
                }
            }
        });
    });
}

function checkHeartbeats() {
    const currentTime = Date.now();
    players.forEach((player, index) => {
        if (currentTime - player.lastHeartbeat > 5000) { // 5 saniyeden fazla süredir heartbeat almadıysak
            console.log(`Player ${player.name} disconnected due to timeout`);
            broadcastMessage(JSON.stringify({ type: "MOVE", source: "server", data: { playerName: player.name, subtype: "DELETE_PLAYER" } }));
            players.splice(index, 1);

        }
    });
}

setInterval(updateBullets, 100); // Her 100 ms'de bir mermi güncellemesi yap
setInterval(checkCollisions, collisionCheckInterval); // Her 10 ms'de bir çarpışma kontrolü yap
setInterval(checkHeartbeats, 1000); // Her 1 saniyede bir heartbeat kontrolü yap

udpServer.bind(41234, () => {
    console.log('UDP Server listening on port 41234');
});