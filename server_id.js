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

    const userId = generateRandomId();
    connectedUsers.set(userId, ws);
    console.log('Client connected! userId: ', userId);
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'createRoom')
        {
            // Generate a random 6-digit room code and ensure it's unique
            let roomId;
            do {
                roomId = generateRandomRoomCode();
            } while (rooms.has(roomId));

            // Validate the request and check if the room name is unique
            if (!rooms.has(roomId)) {
                // Create Room
                const room = {
                    id: roomId,
                    creationTime: new Date().getTime(),
                    maxPlayers: data.maxPlayers,
                    players: [], // Add the clients to the room
                    host: userId, // Store the host
                    modTimerActivator: data.modTimerActivator,
                    modTimer: data.modTimer,
                    gems: [],
                    correctGems: 0,
                    finishedGems: 0,
                    modInfoJson: data.modInfoJson,
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
                rooms.set(roomId, room);
                console.log(`Room Created with id ${room.id}`);
                console.log(rooms.get(roomId).id);
                // Create response for the room host
                const response = {
                    type: 'roomCreated',
                    roomId: room.id,
                    userId: userId,
                    NoP: room.players.length,
                    mNoP: room.maxPlayers,
                    modInfoJson: room.modInfoJson,
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
          console.log(data.roomId);

            const room = rooms.get(data.roomId);
            //Check If room exists
            if (room) {
                //Check if the game has started
                if (!room.currentlyPlaying) {
                    //Check if room has reached maximum players
                    if (room.players.length < room.maxPlayers) {
                        const playerData = {
                          currentUpperBodyIndex: data.currentUpperBodyIndex,
                          currentHairIndex: data.currentHairIndex,
                          currentBackHairIndex: data.currentBackHairIndex,
                          currentExpressionIndex: data.currentExpressionIndex,
                          currentGlassesIndex: data.currentGlassesIndex,
                          currentTrousersIndex: data.currentTrousersIndex,
                          currentShoesIndex: data.currentShoesIndex
                        };
                        // Add the client (student) to the room's list of players
                        //room.players.push(userId);
                        room.players.push({
                          userId: userId,
                          playerData:playerData
                        })
                        // Send a response to the client indicating that they have joined the room
                        const wsResponse = {
                            type: 'wsRoomJoined',
                            roomId: room.id,
                            userId: userId,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers,
                            modInfoJson: room.modInfoJson,
                        };

                        const response = {
                            type: 'roomJoined',
                            roomId: room.id,
                            userId: userId,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers,

                        };

                        const hostResponse = {
                            type: 'hostRoomJoined',
                            roomId: room.id,
                            userId: userId,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers,

                        };
                        console.log('Room Joined by new player');
                        ws.send(JSON.stringify(wsResponse));
                        if (connectedUsers.get(room.host)) {
                            connectedUsers.get(room.host).send(JSON.stringify(hostResponse));
                        }

                        room.players.forEach(player => {
                            if (connectedUsers.get(player.userId)) {
                                connectedUsers.get(player.userId).send(JSON.stringify(response));
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
                        };

                        const response = {
                            type: 'gameStarted',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };
                        console.log('Game Started');
                        ws.send(JSON.stringify(wsResponse));

                        room.players.forEach(player  => {
                            if (connectedUsers.get(player.userId)) {
                                connectedUsers.get(player.userId).send(JSON.stringify(response));
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
                        type: 'hostGameIsAlreadyStarted',
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

                        // room.players.forEach(playerId => {
                        //     if (connectedUsers.get(playerId)) {
                        //         connectedUsers.get(playerId).send(JSON.stringify(response));
                        //     }
                        // });
                        room.players.forEach(player  => {
                            if (connectedUsers.get(player.userId)) {
                                connectedUsers.get(player.userId).send(JSON.stringify(response));
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
                    console.log('2) Gem Found'); ///////////////////////////HERE
                    if (foundGem.found) {
                        const playerFound = foundGem.playersAnswered.some(answer => answer === userId);
                        console.log('2.1) Inside foundGem.found');
                        ////////////////////
                        if (!playerFound) {
                          console.log('2.2) Inside playerFound');
                          // Here I need to do the following
                            // First I have to get an id of the question
                            // Next I have to get an id of the answer
                            // Next I need to find the players's data
                            // Last I want to send that data to the players
                            // In the frontend for every question I need to add a list
                            // Other :
                            // 1) Other Languages
                            // 2) More Questions
                            // 3) Check VPN on mobile
                            // 4) Fix for different resolutions
                            // 5) Add the xapis
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

                                            // room.players.forEach(playerId => {
                                            //     if (connectedUsers.get(playerId)) {
                                            //         connectedUsers.get(playerId).send(JSON.stringify(response));
                                            //     }
                                            // });
                                            room.players.forEach(player  => {
                                                if (connectedUsers.get(player.userId)) {
                                                    connectedUsers.get(player.userId).send(JSON.stringify(response));
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

                                            // room.players.forEach(playerId => {
                                            //     if (connectedUsers.get(playerId)) {
                                            //         connectedUsers.get(playerId).send(JSON.stringify(response));
                                            //     }
                                            // });
                                            room.players.forEach(player  => {
                                                if (connectedUsers.get(player.userId)) {
                                                    connectedUsers.get(player.userId).send(JSON.stringify(response));
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
        console.log('Client disconnected! userId: ', userId);
        let wasHost = false;
        let wasPlayer = false;
        let roomIdToRemove = null;

        // Iterate through rooms to find the room where the client was the host or a player
        rooms.forEach((room, roomId) => {
          room.players.forEach(player => {
            console.log(`Player ID: ${player.userId}`);
            // Replace 'id' and 'name' with the actual properties you have for each player
          });
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
                    // room.players.forEach(playerId => {
                    //     if (connectedUsers.get(playerId)) {
                    //         connectedUsers.get(playerId).send(JSON.stringify(response));
                    //     }
                    // });
                    room.players.forEach(player  => {
                        if (connectedUsers.get(player.userId)) {
                            connectedUsers.get(player.userId).send(JSON.stringify(response));
                        }
                    });
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted`);
                } else {
                  if(room.players.length === 0) {
                    rooms.delete(roomId);
                  } else {
                    // Room is currently playing, send a message
                    const response = {
                        type: 'hostLeft',
                        roomId: roomId,
                        userId: userId,
                    };
                    // room.players.forEach(playerId => {
                    //     if (connectedUsers.get(playerId)) {
                    //         connectedUsers.get(playerId).send(JSON.stringify(response));
                    //     }
                    // });
                    room.players.forEach(player  => {
                        if (connectedUsers.get(player.userId)) {
                            connectedUsers.get(player.userId).send(JSON.stringify(response));
                        }
                    });
                  }

                }
            } else if (room.players.some(player => player.userId === userId)) { //////////////////CHECK
                // Client was a player in the room
                wasPlayer = true;
                const index = room.players.findIndex(player => player.userId === userId); ////////////////////CHECK
                if (index !== -1) {
                    room.players.splice(index, 1); //////////////////////CHECK
                    //send message that player was removed
                    const response = {
                        type: 'playerLeft',
                        roomId: roomId,
                        userId: userId,
                        NoP: room.players.length,
                        mNoP: room.maxPlayers,
                    }

                    const hostResponse = {
                        type: 'hostPlayerLeft',
                        roomId: roomId,
                        userId: userId,
                        NoP: room.players.length,
                        mNoP: room.maxPlayers,
                    }

                    if (connectedUsers.get(room.host)) {
                        connectedUsers.get(room.host).send(JSON.stringify(hostResponse));
                    }
                    room.players.forEach(player  => {
                        if (connectedUsers.get(player.userId)) {
                            connectedUsers.get(player.userId).send(JSON.stringify(response));
                        }
                    });

                }
                if (room.currentlyPlaying) {
                    // Remove the player from room.gems.playersAnswered and room.gems.playersAnsweredCorrectly
                    room.gems.forEach(gem => {
                        if (gem.found) {
                            if (gem.playersAnswered.includes(userId)) { //////////////////HERE
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

//TIMER
const ROOM_EXPIRATION_TIME = 3 * 60 * 60 * 1000; // 60 minutes in milliseconds

// Function to check and close expired rooms
function checkRoomExpiration() {
  const currentTime = new Date().getTime();
  console.log("checking time");
  for (const [roomId, room] of rooms.entries()) {
    const roomCreationTime = room.creationTime || 0;
    if (currentTime - roomCreationTime >= ROOM_EXPIRATION_TIME) {
      // Close the room and notify occupants

      closeRoom(roomId);
    }
  }
}

function closeRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {

    const response = {
        type: 'roomClosed',
        roomId: room.id,
    };

    const hostResponse = {
        type: 'hostRoomClosed',
        roomId: room.id,
      };

    if (connectedUsers.get(room.host)) {
        connectedUsers.get(room.host).send(JSON.stringify(hostResponse));
    }

    room.players.forEach(player => {
        if (connectedUsers.get(player.userId)) {
            connectedUsers.get(player.userId).send(JSON.stringify(response));
        }
    });

    // Remove the room from the rooms Map
    rooms.delete(roomId);

    console.log(`Room ${roomId} has been closed due to expiration.`);
  }
}

// Check every 5 minutes for unused rooms
setInterval(checkRoomExpiration, 5 * 60 * 1000);

function generateRandomRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // Generates a random number between 100000 and 999999
}

function generateRandomId() {
    return crypto.randomBytes(8).toString('hex');
}


// Update the compareLists function to compare userIds
function compareLists(listA, listB) {
    for (const item of listB) {
        const userIdA = typeof item === 'object' ? item.userId : item;
        if (!listA.includes(userIdA)) {
            return false;
        }
    }
    return true;
}


function compareCorrectAnswerLists(listA, listB) {
    // Extract userId values from listB
    const userIdsB = listB.map(item => typeof item === 'object' ? item.userId : item);

    // Count the number of userIds in listA that are also in userIdsB
    const countAInB = listA.filter(item => userIdsB.includes(item)).length;

    return countAInB >= userIdsB.length / 2;
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
