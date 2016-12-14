//// init globals

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var log = document.getElementById("log");

var logArr = [];

var addLog = function(msg) {

    if (logArr.length >= 4) {
        logArr.pop();
    }
    logArr.unshift(msg);

    log.innerHTML = "";
    for (let logMsg of logArr) {
        log.innerHTML += logMsg + "<br/>";
    }
};

var clearLog = function() {
    log.innerHTML = "";
    logArr = [];
};

var GameStates = {
    PLAYERMOVE: 0,
    ANIMATING: 1,
    GAMEOVER: 2,
    VICTORY: 3
};

var gameState = GameStates.PLAYERMOVE;
var gameLevel = 1;
var maxLevels = 8;
var lastCustomMap = null;

var tileScale = 8;
var tileSize = tileScale * 9;
var tileOffset = tileScale / 2;

var realPosFromTilePos = function(x, y) {
    return {
        x: (x * tileSize),
        y: (y * tileSize),
        s: (tileSize + (tileOffset * 2)),
    };
};

var arenaSizeX = 14;
var arenaSizeY = 7;
var inBounds = function(x, y) {
    return (
        x >= 0 && x < arenaSizeX &&
        y >= 0 && y < arenaSizeY
    );
};

var mousePos = { x: 0, y: 0 };

var backgroundImg = new Image();
backgroundImg.src = "arena-7x14.png";

var gapImg = new Image();
gapImg.src = "gap.png";

var Gap = function(x, y) {
    this.x = x;
    this.y = y;
};
var gaps = [];

// particles use real positions at all times
var Particle = function(type, x, y) {
    this.type = type;
    this.img = new Image();
    this.img.src = type + ".png";
    this.x = x;
    this.y = y;
};
var particles = [];

var destroyParticle = function(particle) {
    var idx = particles.indexOf(particle);
    if (idx != -1) {
        particles.splice(idx, 1);
    }
};

var playSound = function(file, quiet) {
    var effect = new Audio(file);
    if (quiet) {
        effect.volume = 0.2;
    } else {
        effect.volume = 0.3;
    }

    effect.play();
};

var playRandomMoveSound = function() {
    var moveSounds = 3;

    // min <= num < max
    var max = Math.floor(moveSounds);
    var num = Math.floor(Math.random() * ((max + 1) - 1)) + 1;

    // make moves quieter
    playSound("move" + num + ".wav", true);
};

// Mobs use tile positions for x/y generally and realPos for drawing
var Mob = function(type, hp, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.img = new Image();
    this.img.src = type + ".png";
    this.idleImg = new Image();
    this.idleImg.src = type + "2.png";

    var realPos = realPosFromTilePos(x, y);
    this.realPos = { x: realPos.x, y: realPos.y };

    this.attackTiles = [];
    this.AIMove = function() {};
    this.animateAttack = {};
};

// all supported enemy types
var validMobTypes = [
    "skeleton",
    "ghoul",
    "demon-spear",
    "demon-mage",
    "orc-knight",
    "orc-mage",
    "black-knight"
];

var validMobShortNames = [
    "s",
    "g",
    "ds",
    "dm",
    "ok",
    "om",
    "bk"
];
var distBetweenTiles = function(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
};

var bestMoveComparator = function(a, b) {
    if (a.dist < b.dist) { return -1 }
    if (a.dist > b.dist) { return 1 }
    return 0;
};

// for running away just sort the opposite way
var fleeMoveComparator = function(a, b) {
    return -bestMoveComparator(a, b);
};

// find closest attack tile and try and move it closer to player
// with no regard for self preservation
var AIBasic = function(self, flees) {
    var closestDist = Number.MAX_VALUE;
    var closestTile = {};

    // for each possible attack, check if it's possible to hit
    // if not then find the closest attack tile near the player
    // in the hopes that we can move the attack tiles closer
    for (let tile of self.attackTiles) {

        // if attacking we can bail on the rest of this function
        if (tile.x == player.x && tile.y == player.y) {
            attack(self, player);
            return;
        }

        // not attacking (yet) keep finding the closest attack tile
        let dist = distBetweenTiles(tile, player);
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
    for (let y = self.y - 1; y <= self.y + 1; ++y) {
        for (let x = self.x - 1; x <= self.x + 1; ++x) {

            // move only within the arena and on x/y axes
            if (!inBounds(x, y) || (x != self.x && y != self.y)) {
                continue;
            }

            // check no other entity is in this spot
            // includes self so no need to check for that separately
            let blocked = false;
            for (let ent of entities) {
                if (ent.x == x && ent.y == y) {
                    blocked = true;
                }
            }

            // gaps also block movement
            for (let gap of gaps) {
                if (gap.x == x && gap.y == y) {
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
};

var animMeleeAttack = function(self, target) {
    queueAnimation(tweenMeleeAttack(self, target));
};

var tweenMeleeAttack = function(self, target) {
    return new TWEEN.Tween(self.realPos)
        .to({ x: target.realPos.x, y: target.realPos.y }, 50)
        .onStart(function() {
            playSound("melee-hit.wav");
        })
        .onComplete(function() {
            onDoneAttack(self, target);
            nextAnimation();
        });
};

var animMageAttack = function(self, target, particleType) {
    queueAnimation(tweenMageAttack(self, target, particleType));
};

var tweenMageAttack = function(self, target, particleType) {
    let particle = new Particle(particleType, self.realPos.x, self.realPos.y);
    return new TWEEN.Tween(particle)
        .to({ x: target.realPos.x, y: target.realPos.y }, 366)
        .onStart(function() {
            particles.push(particle);
            playSound(particle.type + "-shoot.wav");
        })
        .onComplete(function() {
            destroyParticle(particle);
            playSound(particle.type + "-hit.wav");
            onDoneAttack(self, target);
            nextAnimation();
        });
};

var animatedMove = function(self, target) {
    queueAnimation(tweenEntToTile(self, target));
    self.x = target.x;
    self.y = target.y;
};

var tweenEntToTile = function(self, target) {
    return new TWEEN.Tween(self.realPos)
        .to(realPosFromTilePos(target.x, target.y), 150)
        .onStart(function() {
            playRandomMoveSound();
        })
        .onComplete(function() {
            nextAnimation();

            if (self.type == "player-knight") {
                tick();
            }
        });
};

var animationQueue = [];

var nextAnimation = function() {
    // if game ended in between animations (say attack kills player)
    // then don't bother animating anything else
    if (gameState == GameStates.GAMEOVER) {
        animationQueue = [];
    }

    if (animationQueue.length > 0) {
        gameState = GameStates.ANIMATING;
        let anim = animationQueue.pop();
        anim.start();
    } else {
        // if game state was switched to something other than animating
        // leave it, but if we're done animating and everything else is fine
        // remove the animating state
        if (gameState == GameStates.ANIMATING) {
            gameState = GameStates.PLAYERMOVE;
        }
    }
};

var queueAnimation = function(anim) {
    animationQueue.push(anim);

    // only start the next animation if not animating already
    if (gameState != GameStates.ANIMATING) {
        nextAnimation();
    }
};

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
};

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
        mob.AIMove = function() { AIBasic(mob, true) };
        hp = 1;
    } else if (type == "skeleton") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false) };
        hp = 1;
    } else if (type == "ghoul") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false) };
        hp = 1;
    } else if (type == "black-knight") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false) };
        hp = 1;
    } else if (type == "orc-knight") {
        mob.animateAttack = function(target) { animMeleeAttack(mob, target) };
        mob.AIMove = function() { AIBasic(mob, false) };
        hp = 1;
    } else if (type == "orc-mage") {
        mob.animateAttack = function(target) { animMageAttack(mob, target, "spark") };
        mob.AIMove = function() { AIBasic(mob, true) };
        hp = 1;
    }

    mob.attackTiles = getAttackTiles(mob);
    mob.hp = hp;
    return mob;
};

var getPlayerMoves = function() {
    var moves = [];

    for (let y = player.y - 1; y <= player.y + 1; ++y) {
        for (let x = player.x - 1; x <= player.x + 1; ++x) {

            // skip own tile
            if (!(x == player.x && y == player.y)) {

                let actionFn = function() { move(player, x, y) };
                let colour = highlights.MOVE;

                // don't add gaps to moveset
                let validTile = true;
                for (let gap of gaps) {
                    if (gap.x == x && gap.y == y) {
                        validTile = false;
                        break;
                    }
                }

                if (validTile) {
                    for (let ent of entities) {
                        if (ent.x == x && ent.y == y) {
                            actionFn = function() { attack(player, ent) };
                            colour = highlights.ATTACK;
                            break;
                        }
                    }

                    moves.push({ x: x, y: y, action: actionFn, colour: colour });
                }
            }
        }
    }
    return moves;
};

var entities = [];
var player = {};

var initLevel = function(num, customMap) {
    entities = [];
    particles = [];
    player.moves = [];
    gaps = [];

    clearLog();
    gameLevel = num;

    var complete = false;
    if (num > maxLevels) {
        num = 1;
        complete = true;
    }

    var levelName = "";

    // 0 is for custom levels, so they progress to level 1 after victory
    if (num == 0) {
        lastCustomMap = customMap;

        // catch ANYTHING here and go to level 1 if something is messed update
        try {
            console.log(customMap);
            levelName =  "user made level";
            player = makeMob("player-knight", customMap.player.x, customMap.player.y);

            // mobs
            for (let mob of customMap.mobs) {
                if (validMobTypes.indexOf(mob.type) != -1) {
                    if (inBounds(mob.x, mob.y)) {
                        entities.push(makeMob(mob.type, mob.x, mob.y));
                    }
                }
            }

            // tile gaps
            for (let gap of customMap.gaps) {
                if (inBounds(gap.x, gap.y)) {
                    gaps.push(new Gap(gap.x, gap.y));
                }
            }
        } catch (e) {
            initLevel(1);
        }
    }

    if (num == 1) {
        // in standard level set the player always starts in the same spot
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("skeleton", 4, 2));
        entities.push(makeMob("ghoul", 2, 0));
        addLog("when you attack you move into the enemy tile");
        addLog("red squares means you're attacking!");
        addLog("you can move to blue or red squares");
        levelName = "hover over or tap enemies to see attack patterns";
    } else if (num == 2) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("skeleton", 4, 2));
        entities.push(makeMob("ghoul", 2, 0));
        entities.push(makeMob("ghoul", 0, 6));
        entities.push(makeMob("demon-spear", 6, 6));
        entities.push(makeMob("demon-mage", 9, 5));
        levelName = "pick on someone your own size";
    } else if (num == 3) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("orc-knight", 7, 5));
        entities.push(makeMob("orc-knight", 5, 3));
        entities.push(makeMob("orc-mage", 11, 0));
        entities.push(makeMob("orc-mage", 9, 4));
        gaps.push(new Gap(4, 2));
        gaps.push(new Gap(4, 3));
        gaps.push(new Gap(4, 4));
        levelName = "now we're cooking";
    } else if (num == 4) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("demon-mage", 5, 2));
        entities.push(makeMob("demon-mage", 5, 4));
        entities.push(makeMob("black-knight", 7, 3));
        levelName = "pick your battles";
    } else if (num == 5) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("orc-knight", 0, 2));
        entities.push(makeMob("orc-knight", 4, 5));
        entities.push(makeMob("orc-mage", 5, 0));
        entities.push(makeMob("demon-spear", 11, 2));
        entities.push(makeMob("demon-spear", 8, 6));
        levelName = "play time for the baddies";
    } else if (num == 6) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("black-knight", 0, 1));
        entities.push(makeMob("black-knight", 6, 6));
        entities.push(makeMob("demon-mage", 0, 4));
        gaps.push(new Gap(5, 3));
        gaps.push(new Gap(6, 3));
        gaps.push(new Gap(7, 3));
        gaps.push(new Gap(6, 1));
        gaps.push(new Gap(6, 2));
        gaps.push(new Gap(6, 4));
        levelName = "sup";
    } else if (num == 7) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("black-knight", 13, 6));
        entities.push(makeMob("black-knight", 9, 4));
        entities.push(makeMob("demon-mage", 5, 4));
        entities.push(makeMob("skeleton", 2, 1));
        entities.push(makeMob("skeleton", 0, 2));
        entities.push(makeMob("ghoul", 9, 2));
        levelName = "oh, oh no";
    } else if (num == 8) {
        player = makeMob("player-knight", 2, 3);
        entities.push(makeMob("skeleton", 4, 2));
        entities.push(makeMob("ghoul", 2, 0));
        entities.push(makeMob("demon-spear", 6, 6));
        entities.push(makeMob("demon-mage", 9, 5));
        entities.push(makeMob("orc-knight", 7, 3));
        entities.push(makeMob("orc-mage", 11, 1));
        entities.push(makeMob("black-knight", 13, 4));
        levelName = "i beat this once";
    }

    addLog("welcome to level " + num + " (" + levelName +")");

    entities.push(player);
    player.moves = getPlayerMoves();
    gameState = GameStates.PLAYERMOVE;

    if (complete) {
        addLog("you already defeated every level! So here's Level 1 again");
    }
};

var highlights = {
    WARN: "rgba(255,255,0,0.15)",
    MOVE: "rgba(0,148,255,0.18)",
    ATTACK: "rgba(200,30,30,0.30)",
};
var highlighting = []; // [ {x, y, colour}, ... ]

var w = window;
requestAnimationFrame = w.requestAnimationFrame || w.webkitRequestAnimationFrame || w.msRequestAnimationFrame || w.mozRequestAnimationFrame;

//// game code

var getMousePos = function(event) {
    var rect = canvas.getBoundingClientRect();

    return {
        x: Math.floor((event.clientX - (rect.left + (tileScale / 2))) / tileSize),
        y: Math.floor((event.clientY - (rect.top + (tileScale / 2))) / tileSize)
    };
};

canvas.addEventListener("mousemove", function(event) {
    // check if we're hovering over a mob, set his attack highlights
    mousePos = getMousePos(event);
    highlighting = [];
    for (let ent of entities) {
        if (ent.x == mousePos.x && ent.y == mousePos.y) {
            for (let hl of ent.attackTiles) {
                highlighting.push({x: hl.x, y: hl.y, colour: highlights.WARN});
            }
            break;
        }
    }
}, false);

canvas.addEventListener("mouseup", function(event) {
    if (gameState == GameStates.PLAYERMOVE) {
        mousePos = getMousePos(event);
        for (let move of player.moves) {
            if (mousePos.x == move.x && mousePos.y == move.y) {
                move.action();
            }
        }
    } else if (gameState == GameStates.GAMEOVER) {
        // in case player just lost on a custom map, reset it
        if (gameLevel == 0) {
            initLevel(gameLevel, lastCustomMap);
        } else {
            initLevel(gameLevel);
        }
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
};

var highlightPlayerMoves = function() {
    for (var move of player.moves) {
        drawHighlight(move.x, move.y, move.colour);
    }
};

var highlightMobAttackTiles = function() {
    for (var tile of highlighting) {
        drawHighlight(tile.x, tile.y, tile.colour);
    }
};

var drawHighlights = function() {
    highlightPlayerMoves();
    highlightMobAttackTiles();
};

var drawEntities = function(time) {
    for (var ent of entities) {
        if (time % 1000 < 500) {
            ctx.drawImage(ent.img, ent.realPos.x, ent.realPos.y);
        } else {
            ctx.drawImage(ent.idleImg, ent.realPos.x, ent.realPos.y);
        }
    }
};

var drawParticles = function() {
    for (var particle of particles) {
        ctx.drawImage(particle.img, particle.x, particle.y);
    }
};

var drawGaps = function() {
    for (var gap of gaps) {
        let realPos = realPosFromTilePos(gap.x, gap.y);
        ctx.drawImage(gapImg, realPos.x, realPos.y);
    }
};

var drawGame = function(time) {
    ctx.drawImage(backgroundImg, 0, 0);

    drawGaps();

    if (gameState == GameStates.PLAYERMOVE) {
        drawHighlights();
    }

    drawEntities(time);
    drawParticles();
};

// game logic

var move = function(ent, x, y) {
    animatedMove(ent, { x: x, y: y });
};

var attack = function(att, def) {
    att.animateAttack(def);
};

var onDoneAttack = function(att, def) {
    def.hp -= 1;

    if (def.hp <= 0) {
        addLog(att.type + " killed " + def.type + "!");
        // melee attacks cause movement into the tile
        // attacks < 2 away are presumed to be ranged
        if (distBetweenTiles(att, def) < 2) {
            move(att, def.x, def.y);
        }

        let idx = entities.indexOf(def);
        entities.splice(idx, 1);
    }

    if (player == null || player.hp <= 0) {
        addLog("oh no! click to try again");
        gameState = GameStates.GAMEOVER;
        playSound("defeat.wav");
    }
};

var tick = function() {
    console.log("tick");

    for (let ent of entities) {
        ent.AIMove();
        ent.attackTiles = getAttackTiles(ent);
    }

    if (entities.length == 1 && gameState != GameStates.GAMEOVER) {
        addLog("victory! click to continue to next level");
        gameState = GameStates.VICTORY;
        playSound("victory.wav");
    }

    player.moves = getPlayerMoves();
};

var gameLoop = function(time) {
    TWEEN.update(time);
	drawGame(time);
    requestAnimationFrame(gameLoop);
};

var makeLevelSkipButtons = function() {
    var skipList = document.getElementById("skipButtons");

    for (let lvl = 1; lvl <= maxLevels; lvl++) {
        let btn = document.createElement("button");
        let text = document.createTextNode("Level " + lvl);
        btn.addEventListener("click", function() { initLevel(lvl) });
        btn.appendChild(text);
        skipList.appendChild(btn);
    }
};

//// custom level parsing

var getCustomLayout = function(params) {

    // any failure here will and we just go to level 1 instead
    try {
        var mobs = [];
        var customGaps = [];
        var mobParam = params.get("m").split(",");
        var playerParam = params.get("p").split(",");
        var gapsParam = params.get("g");

        var px = Number.parseInt(playerParam.shift());
        var py = Number.parseInt(playerParam.shift());

        // check #1, we expect type-name,x,y, so sets of 3 inputs
        if (mobParam.length % 3 != 0) { return false }
        let mobSets = mobParam.length / 3;

        for (let mob = 0; mob < mobSets; ++mob)  {
            let type = validMobTypes[validMobShortNames.indexOf(mobParam.shift())];
            let x = Number.parseInt(mobParam.shift());
            let y = Number.parseInt(mobParam.shift());
            mobs.push( { type: type, x: x, y: y } );
        }

        // gaps are optional
        if (gapsParam != null) {
            var gapSplit = gapsParam.split(",");

            // bail if gaps don't have x/y pairing
            if (gapSplit.length % 2 != 0) { return false }
            let gapSets = gapSplit.length / 2;

            for (let gap = 0; gap < gapSets; ++gap) {
                let x = Number.parseInt(gapSplit.shift());
                let y = Number.parseInt(gapSplit.shift());
                customGaps.push({ x: x, y: y });
            }
        }

        var layout = {
            player: { x: px, y: py },
            gaps: customGaps,
            mobs: mobs,
        };
        console.log(layout);
        // store this so if player dies we can re-init to it
        return layout;
    } catch (e) {
        return false;
    }
};

//// game entry point

makeLevelSkipButtons();

let mapParams = new URLSearchParams(location.search.slice(1));

// if we have custom map params try and parse those
if (mapParams.get("m") != null &&
    mapParams.get("p") != null) {
    let customMap = getCustomLayout(mapParams);

    // if customMap failed just go to level 1
    if (customMap != false) {
        initLevel(0, customMap);
    } else {
        initLevel(1);
    }
} else {
    initLevel(1);
}

// start it up
requestAnimationFrame(gameLoop);
