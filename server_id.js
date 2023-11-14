const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
require('dotenv').config();


let wss;
if (process.env.ENVIRONMENT==='development'){
  wss = new WebSocket.Server({ port: 8080 });
} else {
  const serverOptions = {
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH)
  };

  // Create an HTTPS server with your SSL options
  const httpsServer = https.createServer(serverOptions);
  httpsServer.listen(8080);

  // Pass the HTTPS server to the WebSocket server
  wss = new WebSocket.Server({ server: httpsServer });
}





// Room management data structure
const rooms = new Map();
const connectedUsers = new Map();


wss.on('connection', (ws) => {
    console.log('Client connected');
    const userId = generateRandomId();
    connectedUsers.set(userId, ws);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'createRoom')
        {
            // Validate the request and check if the room name is unique
            if (!rooms.has(data.roomName)) {
                // Create Room
                const room = {
                    id: data.modCode,
                    name: data.roomName,
                    maxPlayers: data.maxPlayers,
                    players: [], // Add the clients to the room
                    host: userId, // Store the host
                    modTimerActivator: data.modTimerActivator,
                    modTimer: data.modTimer,
                    gems: [],
                    correctGems: 0,
                    finishedGems: 0,
                    currentlyPlaying: false,
                    finishedPlayers: [],
                    gameIsFinished: false,
                };
                // Fill room with gems
                for (const gemForWS of data.gemForWSList) {
                    const gem = {
                        id: gemForWS.id,
                        locId: gemForWS.locationId,
                        iaId: gemForWS.gemInteractibleAreaId,
                        playersAnswered: [],
                        playersAnsweredCorrectly: [],
                        found: false,
                        correct: false,
                        finished: false,
                        doNotOveruse: false,
                    }
                    room.gems.push(gem);
                    console.log("Gem id: ", gem.id, ", iaId: ", gem.iaId, ", locId: ", gem.locId);
                }
                // Add room to the Map
                rooms.set(data.roomName, room);
                console.log('Room Created');
                // Create response for the room host
                const response = {
                    type: 'roomCreated',
                    roomId: room.id,
                    userId: userId,
                    NoP: room.players.length,
                    mNoP: room.maxPlayers
                };
                // Send response to the room host
                ws.send(JSON.stringify(response));
            }
            else
            {
                // Send an error message to the client if the room name is not unique
                const errorResponse = {
                    type: 'roomExists',
                    message: 'Room name already exists.',
                };
                console.log('Room Exists');
                ws.send(JSON.stringify(errorResponse));
            }
        }
        else if (data.type === 'joinRoom')
        {
            const room = rooms.get(data.roomId);
            //Check If room exists
            if (room) {
                //Check if the game has started
                if (!room.currentlyPlaying) {
                    //Check if room has reached maximum players
                    if (room.players.length < room.maxPlayers) {
                        // Add the client (student) to the room's list of players
                        room.players.push(userId);

                        // Send a response to the client indicating that they have joined the room
                        const wsResponse = {
                            type: 'wsRoomJoined',
                            roomId: room.id,
                            userId: userId,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };

                        const response = {
                            type: 'roomJoined',
                            roomId: room.id,
                            userId: userId,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };
                        console.log('Room Joined by new player');
                        ws.send(JSON.stringify(wsResponse));
                        if (connectedUsers.get(room.host)) {
                            connectedUsers.get(room.host).send(JSON.stringify(response));
                        }
                        room.players.forEach(playerId => {
                            if (connectedUsers.get(playerId)) {
                                connectedUsers.get(playerId).send(JSON.stringify(response));
                            }
                        });
                    } else {
                        // Send an error message to the client indicating that the room is full
                        const errorResponse = {
                            type: 'roomIsFull',
                            message: 'Room is full. Cannot join the room.',
                        };
                        console.log('Room Is Full. Player could not join');

                        ws.send(JSON.stringify(errorResponse));
                    }
                } else {
                    // Send an error that the game has already started
                    const errorResponse = {
                        type: 'gameIsAlreadyStarted',
                        message: 'The game has already started.',
                    };
                    console.log('Game has already started');
                    ws.send(JSON.stringify(errorResponse));
                }
            } else {
                // Send an error message to the client indicating that the room does not exist
                const errorResponse = {
                    type: 'roomNotFound',
                    message: 'Room not found.',
                };
                console.log('Room Not Found');
                ws.send(JSON.stringify(errorResponse));
            }
        }
        else if (data.type === 'startGame')
        {
            const room = rooms.get(data.roomId);
            if (room) {
                if (!room.currentlyPlaying) {
                    if (room.players.length) {
                        room.currentlyPlaying = true;
                        const wsResponse = {
                            type: 'gameStartedTeacher',
                            roomId: room.id,
                            userId: userId,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers,
                            //active: room.active, // we need to handle this from frontend <-------- maybe we do not need it
                        };

                        const response = {
                            type: 'gameStarted',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };
                        console.log('Game Started');
                        ws.send(JSON.stringify(wsResponse));

                        room.players.forEach(playerId => {
                            if (connectedUsers.get(playerId)) {
                                connectedUsers.get(playerId).send(JSON.stringify(response));
                            }
                        });
                    } else {
                        const response = {
                            type: 'gameCannotStart',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        }

                        ws.send(JSON.stringify(response));
                    }
                } else {
                    const errorResponse = {
                        type: 'gameIsAlreadyStarted',
                        message: 'The game has already started. You cannot start it again until it is finished',
                    };
                    console.log('Game has already started');
                    ws.send(JSON.stringify(errorResponse));
                }
            } else {
                const errorResponse = {
                    type: 'error',
                    message: 'Game could not start.',
                };

                ws.send(JSON.stringify(errorResponse));
            }
        }
        else if (data.type === 'foundGem')
        {
            const room = rooms.get(data.roomId);
            if (room) {
                console.log("iaId: ", data.iaId, ", locId: ", data.locId);
                const foundGem = room.gems.find(gem => gem.locId === data.locId && gem.iaId === data.iaId);

                if (foundGem) {
                    if (!foundGem.found) {
                        foundGem.found = true;
                        const response = {
                            type: 'gemFound',
                            roomId: room.id,
                            gemId: foundGem.id,
                            locId: foundGem.locId,
                            iaId: foundGem.iaId,
                            activeText: data.activeText,
                            /*locationId: foundGem.locationId,
                            iaId: foundGem.iaId,*/
                        };
                        console.log('Gem Found');

                        room.players.forEach(playerId => {
                            if (connectedUsers.get(playerId)) {
                                connectedUsers.get(playerId).send(JSON.stringify(response));
                            }
                        });
                    }
                } else {
                    const errorResponse = {
                        type: 'gemNotFound',
                        message: 'The gem does not exist in the room',
                    };
                    console.log('The gem is not in the room');
                    ws.send(JSON.stringify(errorResponse));
                }
            } else {
                const errorResponse = {
                    type: 'error',
                    message: 'Room does not exists.',
                };

                ws.send(JSON.stringify(errorResponse));
            }
        }
        else if (data.type === 'answeredGem')
        {
            const room = rooms.get(data.roomId);
            if (room) {
                console.log('1) Room Found');
                const foundGem = room.gems.find(gem => gem.locId === data.locId && gem.iaId === data.iaId);
                if (foundGem) {
                    console.log('2) Gem Found');
                    if (foundGem.found) {
                        const playerFound = foundGem.playersAnswered.some(answer => answer === userId);
                        if (!playerFound) {
                            async function processAnswer() {
                                console.log('3) Entered Async Function');
                                foundGem.playersAnswered.push(userId);
                                console.log('4) Pushed Answer to List');
                                if (data.correct) {
                                    console.log('5) Answer is Correct');
                                    foundGem.playersAnsweredCorrectly.push(userId);
                                    console.log('6) Correct Answer pushed to List ');
                                }

                                console.log('7) Waiting for all players answers for gem: ', foundGem.id);
                                await waitForBothAnswers(foundGem, room);
                                console.log('8) All players answered for gem: ', foundGem.id);
                                console.log('9) Comparing players answers to see if gem was finished');
                                if (compareLists(foundGem.playersAnswered, room.players)) {
                                    console.log('10) Players and answers are the same');
                                    foundGem.finished = true;
                                }
                                console.log('11) Comparing players correct answers to see if gem was correct');
                                if (foundGem.finished && compareCorrectAnswerLists(foundGem.playersAnsweredCorrectly, room.players)) {
                                    console.log('12) Gem is Correct');
                                    foundGem.correct = true;
                                }
                                console.log('13) Checking Overused');
                                if (!foundGem.doNotOveruse) {
                                    console.log('14) Was first time. Updating..');
                                    foundGem.doNotOveruse = true;
                                    if (foundGem.finished) {

                                        room.finishedGems++;
                                    }
                                    if (foundGem.correct) {
                                        room.correctGems++;
                                    }

                                } else {
                                    console.log('14) Was NOT first time. Continueing..');
                                }

                                console.log('15) Checking to see if game is finished');
                                if (room.finishedGems === room.gems.length) {
                                    console.log('16) Game is finished. Checking for not ending game twice...');
                                    if (!room.gameIsFinished) {
                                        console.log('17) First time game ended. Checking to see if players won');
                                        room.gameIsFinished = true;
                                        if (room.correctGems === room.gems.length) {
                                            console.log('18) Players won');
                                            const response = {
                                                type: 'gameFinishedSuccess',
                                                roomId: room.id,
                                            };
                                            const hostResponse = {
                                                type: 'gameFinishedSuccessHost',
                                                roomId: room.id,
                                            };

                                            if (connectedUsers.get(room.host)) {
                                                connectedUsers.get(room.host).send(JSON.stringify(hostResponse));
                                            }

                                            room.players.forEach(playerId => {
                                                if (connectedUsers.get(playerId)) {
                                                    connectedUsers.get(playerId).send(JSON.stringify(response));
                                                }
                                            });
                                            console.log('19) Winning Message Sent');
                                        } else {
                                            console.log('18) Players lost');
                                            const response = {
                                                type: 'gameFinishedFailure',
                                                roomId: room.id,

                                            };
                                            const hostResponse = {
                                                type: 'gameFinishedFailureHost',
                                                roomId: room.id,

                                            };

                                            if (connectedUsers.get(room.host)) {
                                                connectedUsers.get(room.host).send(JSON.stringify(hostResponse));
                                            }

                                            room.players.forEach(playerId => {
                                                if (connectedUsers.get(playerId)) {
                                                    connectedUsers.get(playerId).send(JSON.stringify(response));
                                                }
                                            });
                                            console.log('19) Losing Message Sent');
                                        }
                                    } else {
                                        console.log("16) Game is already over")
                                    }

                                }

                            }
                            processAnswer();
                        }

                    }
                } else {
                    const errorResponse = {
                        type: 'gemNotFound',
                        message: 'The gem does not exist in the room',
                    };
                    console.log('The gem is not in the room');
                    ws.send(JSON.stringify(errorResponse));
                }
            } else {
                const errorResponse = {
                    type: 'error',
                    message: 'Room does not exists.',
                };
                ws.send(JSON.stringify(errorResponse));
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        let wasHost = false;
        let wasPlayer = false;
        let roomIdToRemove = null;

        // Iterate through rooms to find the room where the client was the host or a player
        rooms.forEach((room, roomId) => {
            if (connectedUsers.get(room.host) === ws) {
                // Client was the host
                console.log(`Host of room ${roomId} disconnected`);
                wasHost = true;
                roomIdToRemove = roomId;

                if (!room.currentlyPlaying) {
                    // Room is not currently playing, delete it and send a message
                    const response = {
                        type: 'hostLeftRoomDeleted',
                        roomId: roomId,
                        userId: userId,
                    };
                    room.players.forEach(playerId => {
                        if (connectedUsers.get(playerId)) {
                            connectedUsers.get(playerId).send(JSON.stringify(response));
                        }
                    });
                    rooms.delete(roomId);
                } else {
                    // Room is currently playing, send a message
                    const response = {
                        type: 'hostLeft',
                        roomId: roomId,
                        userId: userId,
                    };
                    room.players.forEach(playerId => {
                        if (connectedUsers.get(playerId)) {
                            connectedUsers.get(playerId).send(JSON.stringify(response));
                        }
                    });
                }
            } else if (room.players.includes(userId)) {
                // Client was a player in the room
                wasPlayer = true;
                const index = room.players.indexOf(userId);
                if (index !== -1) {
                    room.players.splice(index, 1);
                    //send message that player was removed
                    const response = {
                        type: 'playerLeft',
                        roomId: roomId,
                        userId: userId,
                        NoP: room.players.length,
                        mNoP: room.maxPlayers,
                    }
                    if (connectedUsers.get(room.host)) {
                        connectedUsers.get(room.host).send(JSON.stringify(response));
                    }
                    room.players.forEach(playerId => {
                        if (connectedUsers.get(playerId)) {
                            connectedUsers.get(playerId).send(JSON.stringify(response));
                        }
                    });

                }
                if (room.currentlyPlaying) {
                    // Remove the player from room.gems.playersAnswered and room.gems.playersAnsweredCorrectly
                    room.gems.forEach(gem => {
                        if (gem.found) {
                            if (gem.playersAnswered.includes(userId)) {
                                const playerIndex = gem.playersAnswered.indexOf(userId);
                                gem.playersAnswered.splice(playerIndex, 1);
                            }
                            if (gem.playersAnsweredCorrectly.includes(userId)) {
                                const playerIndex = gem.playersAnsweredCorrectly.indexOf(userId);
                                gem.playersAnsweredCorrectly.splice(playerIndex, 1);
                            }

                        }

                    });
                }

            }
            //Check if room has 0 players and if the room is currently playing to be removed
            if (room.players.length === 0 && room.currentlyPlaying) {
                const response = {
                    type: 'noPlayersInRoomDeleteRoom',
                    roomId: roomId,
                }
                if (connectedUsers.get(room.host)) {
                    connectedUsers.get(room.host).send(JSON.stringify(response));
                }
                rooms.delete(roomId);
                console.log(`Deleted room ${roomId} with 0 players and currentlyPlaying = true`);
            }
        });

        // If the client was neither the host nor a player, handle accordingly
        if (!wasHost && !wasPlayer) {
            console.log('Client was neither the host nor a player');
            // You can add custom handling for this case if needed.
        }
    });


});



function generateRandomId() {
    return crypto.randomBytes(8).toString('hex');
}

function compareLists(listA, listB) {
    for (const item of listB) {
        if (!listA.includes(item)) {
            return false;
        }
    }
    return true;
}

function compareCorrectAnswerLists(listA, listB) {
    const countAInB = listA.filter(item => listB.includes(item)).length;

    return countAInB >= listB.length / 2;
}

async function waitForBothAnswers(foundGem, room) {
    return new Promise(resolve => {


        const intervalId = setInterval(() => {
            if (compareLists(foundGem.playersAnswered, room.players)) {
                clearInterval(intervalId);
                resolve();
            }
        }, 100);
    });
}
