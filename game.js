//// init globals

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var log = document.getElementById('log');
var details = document.getElementById('details');

var addLog = function(msg) {
    var oldLog = log.innerHTML;
    log.innerHTML = msg + "<br/>" + oldLog;
}

var clearLog = function() {
    log.innerHTML = "";
}

var setDetails = function(msg) {
    details.innerHTML = msg;
}

var GameStates = { 
    PLAYERMOVE: 0,
    ANIMATING: 1,
    GAMEOVER: 2, 
    VICTORY: 3
};

var gameState = GameStates.PLAYERMOVE;
var gameLevel = 1;
var maxLevels = 4;

var tileScale = 8
var tileSize = tileScale * 9;
var tileOffset = tileScale / 2;

var realPosFromTilePos = function(x, y) {
    return {
        x: (x * tileSize),
        y: (y * tileSize),
        s: (tileSize + (tileOffset * 2)),
    };
}

var arenaSizeX = 14;
var arenaSizeY = 7;
var inBounds = function(x, y) {
    return (
        x >= 0 && x < arenaSizeX &&
        y >= 0 && y < arenaSizeY
    );
}

var mousePos = { x: 0, y: 0 };

var backgroundImg = new Image();
backgroundImg.src = "arena-7x14.png";

// particles use real positions at all times
var Particle = function(type, x, y) {
    this.type = this;
    this.img = new Image();
    this.img.src = type + ".png";
    this.x = x;
    this.y = y;
}
var particles = [];

var destroyParticle = function(particle) {
    var idx = particles.indexOf(particle);
    if (idx != -1) {
        particles.splice(idx, 1);
    }
}

// Mobs use tile positions for x/y generally and realPos for drawing
var Mob = function(type, hp, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.img = new Image();
    this.img.src = type + ".png";
    var realPos = realPosFromTilePos(x, y);
    this.realPos = { x: realPos.x, y: realPos.y };

    this.attackTiles = [];
    this.AIMove = function() {};
    this.animateAttack = {};
}

var distBetweenTiles = function(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
} 

var bestMoveComparator = function(a, b) {
    if (a.dist < b.dist) { return -1; }
    if (a.dist > b.dist) { return 1; }
    return 0;    
}

// for running away just sort the opposite way
var fleeMoveComparator = function(a, b) {
    return -bestMoveComparator(a, b);
}

// find closest attack tile and try and move it closer to player
// with no regard for self preservation
var AIBasic = function(self, flees) {
    var closestDist = Number.MAX_VALUE;
    var closestTile = {};

    // for each possible attack, check if it's possible to hit
    // if not then find the closest attack tile near the player
    // in the hopes that we can move the attack tiles closer
    for (var tile of self.attackTiles) {
        
        // if attacking we can bail on the rest of this function
        if (tile.x == player.x && tile.y == player.y) {
            attack(self, player);
            return;
        }

        // not attacking (yet) keep finding the closest attack tile
        var dist = distBetweenTiles(tile, player);
        if (dist < closestDist) {
            closestDist = dist;
            closestTile = tile;
        }
    }

    // collect possible moves
    // try and move the closest attack tile even
    // closer to the player

    // we will just rank and pick the closest movement,
    // even if it gets us killed

    var moves = [];
    for (var y = self.y - 1; y <= self.y + 1; ++y) {
        for (var x = self.x - 1; x <= self.x + 1; ++x) {
            
            // move only within the arena and on x/y axes
            if ((x != self.x || y != self.y) && !inBounds(x, y)) {
                continue;
            }

            // check no other entity is in this spot
            // includes self so no need to check for that separately
            var blocked = false;
            for (var ent of entities) {
                if (ent.x == x && ent.y == y) {
                    blocked = true;                    
                }
            }

            if (!blocked) {
                moves.push({ x: x, y: y, dist: distBetweenTiles({x: x, y: y}, player) });
            }
        }
    }
    
    // if player is close and mob likes to flee, pick furthers away move
    var comparator = bestMoveComparator; 
    if (flees && distBetweenTiles(self, player) < 2) {
        comparator = fleeMoveComparator;
        addLog(self.type + " flees!");
    }

    moves.sort(comparator);
    var preferredMove = moves.shift();
    move(self, preferredMove.x, preferredMove.y);
}

var animMeleeAttack = function(self, target) {
    queueAnimation(tweenMeleeAttack(self, target));
}

var tweenMeleeAttack = function(self, target) {    
    return new TWEEN.Tween(self.realPos)
        .to({ x: target.realPos.x, y: target.realPos.y }, 50)
        .onComplete(function() {
            onDoneAttack(self, target);
            nextAnimation();
        });
}

var animMageAttack = function(self, target, particleType) {
    var particle = new Particle(particleType, self.realPos.x, self.realPos.y);
    particles.push(particle);
    queueAnimation(tweenMageAttack(self, target, particle));
}

var tweenMageAttack = function(self, target, particle) {
    console.log(self, target, particle);
    return new TWEEN.Tween(particle)
        .to({ x: target.realPos.x, y: target.realPos.y }, 333)
        .onComplete(function() {
            destroyParticle(particle);
            onDoneAttack(self, target);
            nextAnimation();
        });
}

var animatedMove = function(self, target) {
    queueAnimation(tweenEntToTile(self, target));
    self.x = target.x;
    self.y = target.y;
}

var tweenEntToTile = function(self, target) {
    return new TWEEN.Tween(self.realPos)
        .to(realPosFromTilePos(target.x, target.y), 150)
        .onComplete(function() {
            nextAnimation();

            if (self.type == "player-knight") {
                tick();
            }            
        });
}

var animationQueue = [];

var nextAnimation = function() {
    // if game ended in between animations (say attack kills player)
    // then don't bother animating anything else
    if (gameState == GameStates.GAMEOVER) {
        animationQueue = [];
    }

    if (animationQueue.length > 0) {
        gameState = GameStates.ANIMATING;
        var anim = animationQueue.pop();
        anim.start();
    } else {
        // if game state was switched to something other than animating
        // leave it, but if we're done animating and everything else is fine
        // remove the animating state
        if (gameState == GameStates.ANIMATING) {
            gameState = GameStates.PLAYERMOVE;
        }
    }
}
var queueAnimation = function(anim) {
    animationQueue.push(anim);
    
    // only start the next animation if not animating already
    if (gameState != GameStates.ANIMATING) {
        nextAnimation();
    }
}

var getAttackTiles = function(mob) {
    var tiles = [];
    var x = mob.x;
    var y = mob.y;
    if (mob.type == "ghoul") {
        tiles = [ 
            { x: x - 1, y: y     },
            { x: x + 1, y: y     },
            { x: x,     y: y - 1 },
            { x: x,     y: y + 1 },
            { x: x - 1, y: y - 1 },
            { x: x + 1, y: y + 1 },
            { x: x - 1, y: y + 1 },
            { x: x + 1, y: y - 1 },
        ];
    } else if (mob.type == "skeleton") {
        tiles = [ 
            { x: x - 1, y: y     },
            { x: x + 1, y: y     },
            { x: x,     y: y - 1 },
            { x: x,     y: y + 1 },
        ];
    } else if (mob.type == "demon-spear") {
        tiles = [
            { x: x - 2, y: y     },
            { x: x + 2, y: y     },
            { x: x,     y: y - 2 },
            { x: x,     y: y + 2 },
            { x: x - 1, y: y - 1 },
            { x: x + 1, y: y - 1 },
            { x: x - 1, y: y + 1 },
            { x: x + 1, y: y + 1 },
        ];
    } else if (mob.type == "demon-mage") {
        tiles = [
            { x: x - 1, y: y - 1 },
            { x: x + 1, y: y - 1 },
            { x: x - 1, y: y + 1 },
            { x: x + 1, y: y + 1 },
            { x: x - 2, y: y - 2 },
            { x: x - 2, y: y + 2 },
            { x: x + 2, y: y - 2 },
            { x: x + 2, y: y + 2 },
        ];
    } else if (mob.type == "orc-knight") {
        tiles = [
            { x: x - 1, y: y     },
            { x: x + 1, y: y     },
            { x: x,     y: y - 1 },
            { x: x,     y: y + 1 },
            { x: x - 2, y: y     },
            { x: x + 2, y: y     },
            { x: x,     y: y - 2 },
            { x: x,     y: y + 2 },
        ];
    } else if (mob.type == "orc-mage") {
        tiles = [
            { x: x - 2, y: y     },
            { x: x + 2, y: y     },
            { x: x,     y: y - 2 },
            { x: x,     y: y + 2 },
            { x: x - 3, y: y     },
            { x: x + 3, y: y     },
            { x: x,     y: y - 3 },
            { x: x,     y: y + 3 },
            { x: x - 4, y: y     },
            { x: x + 4, y: y     },
            { x: x,     y: y - 4 },
            { x: x,     y: y + 4 },
        ];
    } else if (mob.type == "black-knight") {
        tiles = [
            { x: x - 1, y: y     },
            { x: x + 1, y: y     },
            { x: x,     y: y - 1 },
            { x: x,     y: y + 1 },
            { x: x - 1, y: y - 1 },
            { x: x + 1, y: y + 1 },
            { x: x - 1, y: y + 1 },
            { x: x + 1, y: y - 1 },
            { x: x - 2, y: y     },
            { x: x + 2, y: y     },
            { x: x,     y: y - 2 },
            { x: x,     y: y + 2 },
        ];
    }

    // cull any out-of-bound tiles here
    for (var tile of tiles) {
        if (!inBounds(tile.x, tile.y)) {
            tiles.splice(tiles.indexOf(tile), 1);
        }
    } 

    return tiles;
}

var makeMob = function(type, x, y) {
    var hp = 1;
    var mob = new Mob(type, hp, x, y);

    if (type == "player-knight") {
        hp = 1;
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
    } else if (type == "player-ranger") {
        hp = 1;
    } else if (type == "player-mage") {
        hp = 1;
        mob.animateAttack = function(target) { animMageAttack(mob, target, "spark") };
    } else if (type == "demon-spear") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, true) };
        hp = 1;
    } else if (type == "demon-mage") {
        mob.animateAttack = function(target) { animMageAttack(mob, target, "spark") };
        mob.AIMove = function() { AIBasic(mob, true); };
        hp = 1;
    } else if (type == "skeleton") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false); };
        hp = 1;
    } else if (type == "ghoul") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false); };
        hp = 1;
    } else if (type == "black-knight") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false); };
        hp = 1;
    } else if (type == "orc-knight") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false); };
        hp = 1;
    } else if (type == "orc-mage") {
        mob.animateAttack = function(target) { animMageAttack(mob, target, "spark") };
        mob.AIMove = function() { AIBasic(mob, true); };        
        hp = 1;
    }

    mob.attackTiles = getAttackTiles(mob);
    mob.hp = hp;
    return mob;
}

var getMoveFn = function(ent, x, y) {
    return function() { move(ent, x, y )};
}

var getAttackFn = function(att, def) {
    return function() { attack(att, def) };
}

var getPlayerMoves = function() {
    var moves = [];
    for (var y = player.y - 1; y <= player.y + 1; ++y) {
        for (var x = player.x - 1; x <= player.x + 1; ++x) {

            // skip own tile            
            if (!(x == player.x && y == player.y)) {
                var actionFn = getMoveFn(player, x, y);

                var colour = highlights.MOVE;

                for (var ent of entities) {
                    if (ent.x == x && ent.y == y) {
                        actionFn = getAttackFn(player, ent);
                        colour = highlights.ATTACK;
                        break;
                    }
                }
                
                moves.push({ x: x, y: y, action: actionFn, colour: colour });
            }
        }
    }
    return moves;
}

var entities = [];
var player = {};

var initLevel = function(num) {   
    entities = [];
    particles = [];
    clearLog();
    
    var complete = false;
    if (num > maxLevels) {
        num = 1;
        complete = true;
    }

    var levelName = "";

    player = makeMob("player-knight", 2, 3);
    player.moves = [];
    entities.push(player);

    if (num == 1) {   
        entities.push(makeMob("skeleton", 4, 2));
        entities.push(makeMob("ghoul", 2, 0));
        levelName = "first blood";
    } else if (num == 2) {
        entities.push(makeMob("demon-spear", 6, 6));
        entities.push(makeMob("demon-mage", 9, 5));
        levelName = "pick on someone your own size"
    } else if (num == 3) {
        entities.push(makeMob("orc-knight", 7, 3));
        entities.push(makeMob("orc-mage", 11, 1));
        entities.push(makeMob("black-knight", 13, 4));
        levelName = "now we're cooking";        
    } else if (num == 4) {
        entities.push(makeMob("skeleton", 4, 2));
        entities.push(makeMob("ghoul", 2, 0));
        entities.push(makeMob("demon-spear", 6, 6));
        entities.push(makeMob("demon-mage", 9, 5));
        entities.push(makeMob("orc-knight", 7, 3));
        entities.push(makeMob("orc-mage", 11, 1));
        entities.push(makeMob("black-knight", 13, 4));
        levelName = "i haven't made any more levels yet, so";
    }

    player.moves = getPlayerMoves();
    gameState = GameStates.PLAYERMOVE;

    if (complete) {
        setDetails("You already defeated every level! Here's Level 1 again");
    } else {
        setDetails("Level " + num + ": " + levelName);
    }
}

var highlights = {
    WARN: 'rgba(255,255,0,0.15)',
    MOVE: 'rgba(0,148,255,0.18)',
    ATTACK: 'rgba(200,30,30,0.30)',
};
var highlighting = []; // [ {x, y, colour}, ... ]

var w = window;
requestAnimationFrame = w.requestAnimationFrame || w.webkitRequestAnimationFrame || w.msRequestAnimationFrame || w.mozRequestAnimationFrame;
var then = Date.now();

//// game code

var getMousePos = function() {
    var rect = canvas.getBoundingClientRect();

    return {
        x: Math.floor((event.clientX - (rect.left + (tileScale / 2))) / tileSize),
        y: Math.floor((event.clientY - (rect.top + (tileScale / 2))) / tileSize)
    };
}

canvas.addEventListener('mousemove', 
    function(event) {        
        // check if we're hovering over a mob, set his attack highlights
        mousePos = getMousePos();
        highlighting = [];
        for (var ent of entities) {
            if (ent.x == mousePos.x && ent.y == mousePos.y) {
                for (var hl of ent.attackTiles) {
                    highlighting.push({x: hl.x, y: hl.y, colour: highlights.WARN});
                }
                break;
            }
        }

    }, false);

canvas.addEventListener('mouseup', 
    function(event) {
        // if playermove validate move then tick
        var moved = false;            

        if (gameState == GameStates.PLAYERMOVE) {
            mousePos = getMousePos();
            for (var move of player.moves) {
                if (mousePos.x == move.x && mousePos.y == move.y) {
                    move.action();
                }
            }
        } else if (gameState == GameStates.GAMEOVER) {
            initLevel(gameLevel);
        } else if (gameState == GameStates.VICTORY) {
            gameLevel++;
            initLevel(gameLevel);
        }
    }, false);

// rendering

var drawHighlight = function(x, y, fillColour) {
    ctx.fillStyle = fillColour;
                 
    var realPos = realPosFromTilePos(x, y);
    ctx.fillRect(realPos.x + tileOffset, realPos.y + tileOffset, realPos.s - (tileOffset * 2), realPos.s - (tileOffset * 2));
} 

var highlightPlayerMoves = function() {   
    for (var move of player.moves) {
        drawHighlight(move.x, move.y, move.colour);
    }
}

var highlightMobAttackTiles = function() {
    for (var tile of highlighting) {
        drawHighlight(tile.x, tile.y, tile.colour);
    }
}

var drawHighlights = function() {
    highlightPlayerMoves();
    highlightMobAttackTiles();
}

var drawEntities = function() {
    for (var ent of entities) {
        ctx.drawImage(ent.img, ent.realPos.x, ent.realPos.y); 
    }
}

var drawParticles = function() {
    for (var particle of particles) {
        ctx.drawImage(particle.img, particle.x, particle.y);
    }
}

var drawGame = function(delta) {
    ctx.drawImage(backgroundImg, 0, 0);

    if (gameState == GameStates.PLAYERMOVE) {
        drawHighlights();
    }
    
    drawEntities();
    drawParticles();    
}

// game logic

var move = function(ent, x, y) {   
    animatedMove(ent, { x: x, y: y });
}

var attack = function(att, def) {
    att.animateAttack(def);
}

var onDoneAttack = function(att, def) {
    def.hp -= 1;
    addLog(att.type + " attacks " + def.type);

    if (def.hp <= 0) {
        addLog(def.type + " dies!");
        // melee attacks cause movement into the tile
        // attacks < 2 away are presumed to be ranged 
        if (distBetweenTiles(att, def) < 2) {
            move(att, def.x, def.y);
        }

        var idx = entities.indexOf(def);
        entities.splice(idx, 1);
    }

    if (player == null || player.hp <= 0) {
        gameState = GameStates.GAMEOVER;
        setDetails("Game over! Click to retry");
    }     
}

var tick = function() {
    console.log("tick");

    for (var ent of entities) {
        ent.AIMove();
        ent.attackTiles = getAttackTiles(ent);                      
    }

    if (entities.length == 1 && gameState != GameStates.GAMEOVER) {
        gameState = GameStates.VICTORY;
        setDetails("You are victorious! Click to continue to the next level");
    }

    player.moves = getPlayerMoves();
}

var gameLoop = function(time) {    
    TWEEN.update(time);
	drawGame(time);
    requestAnimationFrame(gameLoop);
}

var skipToLevel = function(lvl) {
    initLevel(lvl);
}

var makeLevelSkipButtons = function() {
    var skipList = document.getElementById('skipButtons');
    
    for (let lvl = 1; lvl <= maxLevels; lvl++) {
        var btn = document.createElement("button");
        var text = document.createTextNode("Level " + lvl);
        btn.addEventListener("click", function() { initLevel(lvl) });
        btn.appendChild(text);
        skipList.appendChild(btn);
    }
}

//// game entry point

makeLevelSkipButtons();

initLevel(gameLevel); // will be done via level selection buttons
requestAnimationFrame(gameLoop);
