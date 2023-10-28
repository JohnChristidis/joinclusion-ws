const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Room management data structure
const rooms = new Map();
const connectedUsers = new Map();
//let userIdCounter = 1;

wss.on('connection', (ws) => {
    console.log('Client connected');
     //const userId = generateUniqueId();
     //connectedUsers.set(userId, ws);
     ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'createRoom') {
            // Validate the request and check if the room name is unique
            if (!rooms.has(data.roomName)) {
                // Create a new room
                // Inside the 'createRoom' message handling
                const room = {
                    id: data.modCode,
                    name: data.roomName,
                    maxPlayers: data.maxPlayers,
                    players: [], // Add the client to the room
                    host: ws, // Store the host
                    modTimerActivator: data.modTimerActivator,
                    modTimer: data.modTimer,
                    gems: [],
                    correctGems: 0,
                    finishedGems: 0,
                    active: false,
                    finishedCounter : 0,
                };
               /* room.gems.forEach(gem => {
                    console.log(`Gem ID ${gem.id}: noAnswers = ${gem.noAnswers}`);
                });*/
                //console.log(data.gemForWS.length);
                for (const gemForWS of data.gemForWSList) {
                    const gem = {
                        id: gemForWS.id,
                        locId: gemForWS.locationId,
                        iaId: gemForWS.gemInteractibleAreaId,
                        noAnswers: 0,
                        noCorrectAnswers: 0,
                        found: false,
                        correct: false,
                        finished: false,
                    }
                    room.gems.push(gem);
                    
                }


                rooms.set(data.roomName, room);
                console.log('Room Created');
                console.log(room.gems.length);

                // Send a response to the client with room creation status and room ID
                const response = {
                    type: 'roomCreated',
                    roomId: room.id,
                    NoP : room.players.length,
                    mNoP : room.maxPlayers
                };

                ws.send(JSON.stringify(response));
            } else {
                // Send an error message to the client if the room name is not unique
                const errorResponse = {
                    type: 'roomExists',
                    message: 'Room name already exists.',
                };
                console.log('Room Exists');
                ws.send(JSON.stringify(errorResponse));
            }
        }
        else if (data.type === 'checkRoom') {
            // Check if a room with the given code exists
            const room = rooms.get(data.roomCode);

            if (room) {
                // Send a response to the client indicating that the room exists
                const response = {
                    type: 'roomExists',
                };

                ws.send(JSON.stringify(response));
            } else {
                // Send a response to the client indicating that the room does not exist
                const response = {
                    type: 'roomNotFound',
                };
                console.log('Room Checked');
                ws.send(JSON.stringify(response));
            }
        }
        else if (data.type === 'joinRoom') {
          // Join the room with the given ID
          const room = rooms.get(data.roomId);

            if (room) {
                if (!room.active) {
                    if (room.players.length < room.maxPlayers) {
                        // Add the client (student) to the room's list of players
                        room.players.push(ws);

                        // Send a response to the client indicating that they have joined the room
                        const wsResponse = {
                            type: 'wsRoomJoined',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };

                        const response = {
                            type: 'roomJoined',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };
                        console.log('Room Joined by new player');
                        ws.send(JSON.stringify(wsResponse));
                        room.host.send(JSON.stringify(response));
                        room.players.forEach(player => {
                            if (player !== ws) {
                                player.send(JSON.stringify(response));
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
        else if (data.type === 'leaveRoom') {
          // Check if the room with the given ID exists
          const room = rooms.get(data.roomId);

          if (room) {
              // Find the index of the client (student) in the room's players array
              const playerIndex = room.players.indexOf(ws);

              if (playerIndex !== -1) {
                  // Remove the client (student) from the room's players array
                  room.players.splice(playerIndex, 1);

                  const wsResponse = {
                      type: 'wsRoomLeft',
                      roomId: data.roomId,
                  };
                  // Send a response to the client indicating that they have left the room
                  const response = {
                      type: 'roomLeft',
                      roomId: data.roomId,
                      NoP: room.players.length,
                      mNoP: room.maxPlayers

                  };

                  ws.send(JSON.stringify(wsResponse));
                  room.host.send(JSON.stringify(response));
                  room.players.forEach(player => {
                    if (player !== ws) {
                      player.send(JSON.stringify(response));
                    }
                  });

                  console.log('Client left room:', data.roomId);
              } else {
                  // Send an error message to the client indicating that they are not in the room
                  const errorResponse = {
                      type: 'error',
                      message: 'You are not in this room.',
                  };
                  console.log('Error when trying to leave the room. Probably not in the room');
                  ws.send(JSON.stringify(errorResponse));
              }
          } else {
              // Send an error message to the client indicating that the room does not exist
              const errorResponse = {
                  type: 'error',
                  message: 'Room not found.',
              };

              ws.send(JSON.stringify(errorResponse));
          }
      }
        else if (data.type === 'deleteRoom') {
          // Check if the room with the given ID exists
          const room = rooms.get(data.roomId);

          if (room) {
              // Delete the room
              rooms.delete(data.roomId);

              // Send a response to the client indicating that the room has been deleted
              const response = {
                  type: 'roomDeleted',
                  roomId: data.roomId,
              };

              const wsResponse = {
                  type: 'hostLeft',
                  roomId: data.roomId,
              };

              ws.send(JSON.stringify(wsResponse));
              //room.host.send(JSON.stringify(response));
              room.players.forEach(player => {
                if (player !== ws) {
                  player.send(JSON.stringify(response));
                }
              });
              console.log('Room deleted:', data.roomId);
          } else {
              // Send an error message to the client indicating that the room does not exist
              const errorResponse = {
                  type: 'error',
                  message: 'Room not found.',
              };

              ws.send(JSON.stringify(errorResponse));
          }
      }
        else if (data.type === 'startGame') {
          // Join the room with the given ID
          const room = rooms.get(data.roomId);

            if (room) {
                if (!room.active) {
                    if (room.players.length > 0) {
                        room.active = true;
                        const wsResponse = {
                            type: 'gameStartedTeacher',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers,
                            active: room.active, // we need to handle this from frontend <-------- maybe we do not need it
                        };

                        const response = {
                            type: 'gameStarted',
                            roomId: room.id,
                            NoP: room.players.length,
                            mNoP: room.maxPlayers
                        };
                        console.log('Game Started');
                        ws.send(JSON.stringify(wsResponse));
                        //room.host.send(JSON.stringify(response));
                        room.players.forEach(player => {
                            if (player !== ws) {
                                player.send(JSON.stringify(response));
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
              // Send an error message to the client indicating that the room does not exist
              const errorResponse = {
                  type: 'error',
                  message: 'Game could not start.',
              };

              ws.send(JSON.stringify(errorResponse));
          }
         }// Handle other message types here
        else if (data.type === 'foundGem') {
            // Join the room with the given ID
            const room = rooms.get(data.roomId);

            if (room) {
                const foundGem = room.gems.find(gem => gem.id === data.gemId);
                if (foundGem) {
                    if (!foundGem.found) {
                        foundGem.found = true;
                        const response = {
                            type: 'gemFound',
                            gemId: foundGem.id,
                            locationId: foundGem.locationId,
                            iaId: foundGem.iaId,
                        };
                        console.log('Gem Found');
                        room.players.forEach(player => {
                            player.send(JSON.stringify(response));
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
                // Send an error message to the client indicating that the room does not exist
                const errorResponse = {
                    type: 'error',
                    message: 'Room does not exists.',
                };

                ws.send(JSON.stringify(errorResponse));
            }
         }
        else if (data.type === 'answeredGem') {
            // Join the room with the given ID
            const room = rooms.get(data.roomId);

            if (room) {
                const foundGem = room.gems.find(gem => gem.id === data.gemId);
                if (foundGem) {
                    if (foundGem.found) {
                        foundGem.noAnswers++;
                        if (data.correct) {
                            foundGem.noCorrectAnswers++
                        }
                        if (foundGem.noAnswers >= room.players.length) { 
                            foundGem.finished = true;
                        }
                        if (foundGem.noAnswers >= room.players.length && foundGem.noCorrectAnswers > room.players.length / 2) { 
                            foundGem.correct = true;
                        }
                        if (foundGem.finished) {
                            room.finishedGems++;
                        }
                        if (foundGem.correct) {
                            room.correctGems++;
                        }
                        if (room.finishedGems === room.gems.length) {
                            if (room.correctGems === room.gems.length) {
                                const response = {
                                    type: 'gameFinishedSuccess',

                                };
                                const hostResponse = {
                                    type: 'gameFinishedSuccessHost',

                                };
                                console.log('Game Finished. Players Won');
                                room.host.send(JSON.stringify(hostResponse));
                                room.players.forEach(player => {
                                    player.send(JSON.stringify(response));
                                });
                            } else {
                                const response = {
                                    type: 'gameFinishedFailure',

                                };
                                const hostResponse = {
                                    type: 'gameFinishedFailureHost',

                                };
                                console.log('Game Finished. Players Lost');
                                room.host.send(JSON.stringify(hostResponse));
                                room.players.forEach(player => {
                                    player.send(JSON.stringify(response));
                                });
                            }
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
                // Send an error message to the client indicating that the room does not exist
                const errorResponse = {
                    type: 'error',
                    message: 'Room does not exists.',
                };

                ws.send(JSON.stringify(errorResponse));
            }
         }
        else if (data.type === 'endGame') {
            // Join the room with the given ID
            const room = rooms.get(data.roomId);

            if (room) {
                room.finishedCounter++;
                if (room.finishedCounter >= room.players.length) {
                    const response = {
                        type: 'gameEnded',

                    };
                    const hostResponse = {
                        type: 'gameEndedHost',

                    };
                    console.log('Game Ended Finaly');
                    
                    room.players.forEach(player => {
                        player.send(JSON.stringify(response));
                    });
                    room.host.send(JSON.stringify(hostResponse));
                    rooms.delete(data.roomId);
                }

            } else {
                // Send an error message to the client indicating that the room does not exist
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

    // connectedUsers.forEach((userConnection, user) => {
    //       if (userConnection === ws) {
    //           connectedUsers.delete(user);
    //           console.log(`User with ID ${user} disconnected.`);
    //       }
    //   });

    // Check if the disconnected client is the host of any room
      rooms.forEach((room, roomId) => {
        console.log(roomId);
        if (room.host === ws) {
            console.log(`Host of room ${roomId} disconnected, deleting the room.`);

            const playerLeftResponse = {
              type: 'roomDeleted',
              roomId: roomId,
              NoP: room.players.length,
              //mNoP: room.maxPlayers
            };

            room.players.forEach(player => {
              player.send(JSON.stringify(playerLeftResponse));
            });
            rooms.delete(roomId);
        } else {
            const playerIndex = room.players.indexOf(ws);
              if (playerIndex !== -1) {
                  // Remove the client (student) from the room's players array
                  room.players.splice(playerIndex, 1);

                  console.log(`Player disconnected from room ${roomId}.`);
                  console.log("Checking to see if the game should be finished...");
                  /*if (room.finishedCounter >= room.players.length) {
                      const response = {
                          type: 'gameEnded',

                      };
                      const hostResponse = {
                          type: 'gameEndedHost',

                      };
                      console.log('Game Ended Finaly');

                      room.players.forEach(player => {
                          player.send(JSON.stringify(response));
                      });
                      room.host.send(JSON.stringify(hostResponse));
                      rooms.delete(data.roomId);
                  }*/
                  if (room.players.length >= room.maxPlayers / 2) {
                      room.gems.forEach(gem => {
                          if (!gem.finished) {
                              if (gem.noAnswers >= players.length) { 
                                  gem.finished = true;
                              }
                              if (gem.noAnswers >= room.players.length && gem.noCorrectAnswers > room.players.length / 2) { 
                                  gem.correct = true;
                              }
                              if (gem.finished) {
                                  room.finishedGems++;
                              }
                              if (gem.correct) {
                                  room.correctGems++;
                              }
                              if (room.finishedGems === gems.length) {
                                  if (room.correctGems === gems.length) {
                                      const response = {
                                          type: 'gameFinishedSuccess',

                                      };
                                      const hostResponse = {
                                          type: 'gameFinishedSuccessHost',

                                      };
                                      console.log('Game Finished. Players Won');
                                      room.host.send(JSON.stringify(hostResponse));
                                      room.players.forEach(player => {
                                          player.send(JSON.stringify(response));
                                      });
                                  } else {
                                      const response = {
                                          type: 'gameFinishedFailure',

                                      };
                                      const hostResponse = {
                                          type: 'gameFinishedFailureHost',

                                      };
                                      console.log('Game Finished. Players Lost');
                                      room.host.send(JSON.stringify(hostResponse));
                                      room.players.forEach(player => {
                                          player.send(JSON.stringify(response));
                                      });
                                  }
                              }
                          }
                      });
                  } else {
                      const response = {
                          type: 'notEnoughPlayers',
                      };

                  }
                  // Should the message be recieved?? 
                  const playerLeftResponse = {
                    type: 'playerLeft',
                    roomId: roomId,
                    NoP: room.players.length,
                    mNoP: room.maxPlayers

                };
                room.host.send(JSON.stringify(playerLeftResponse));
                room.players.forEach(player => {
                    player.send(JSON.stringify(playerLeftResponse));
                });
                // <--should delete room??
              } else {
                  console.log(`Host of room ${roomId} is still connected.`);
              }
        }
      });
    });
});
// function generateUniqueId() {
//     return Math.random().toString(36).substr(2, 9);
// }
