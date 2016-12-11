var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var shareBox = document.getElementById('shareBox');

var player = null;
var entities = [];
var mobBrush = "player-knight";

var tileScale = 8
var tileSize = tileScale * 9;
var tileOffset = tileScale / 2;

var backgroundImg = new Image();
backgroundImg.src = "arena-7x14.png";

var updateShareLink = function() {
    var baseLink = "http://astudyinpixels.com/ld37/index.html";

    if (player == null) { 
        shareBox.innerHTML = "you must add a player to generate the share url"; 
        return; 
    };

    var link = "?player=" + player.x + "," + player.y;
    link += "&mobs=";

    if (entities.length <= 1) {
        shareBox.innerHTML = "you must add at least 1 enemy to generate the share url";
        return;
    }

    for (let i = 0; i < entities.length; ++i) {
        // player is handled differently, for probably unnecessary reasons
        let ent = entities[i];
        if (ent.type != "player-knight") {
            link += ent.type + "," + ent.x + "," + ent.y + ",";            
        }        
    }
    link = link.slice(0, -1);
    
    var finalLink = baseLink + link;
    shareBox.innerHTML = finalLink;

    var testMapDiv = document.getElementById("testMap");
    testMapDiv.innerHTML = "test your map by clicking <a href=" + 
        finalLink + ">this</a>";
}
updateShareLink();

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


var Mob = function(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.img = new Image();
    this.img.src = type + ".png";
    this.idleImg = new Image();
    this.idleImg.src = type + "2.png";
    
    var realPos = realPosFromTilePos(x, y);
    this.realPos = { x: realPos.x, y: realPos.y };
}

// all support entity types
var validBrushTypes = [
    "player-knight",
    "skeleton",
    "ghoul",
    "demon-spear",
    "demon-mage",
    "orc-knight",
    "orc-mage",
    "black-knight"
];


var getMousePos = function() {
    var rect = canvas.getBoundingClientRect();

    return {
        x: Math.floor((event.clientX - (rect.left + (tileScale / 2))) / tileSize),
        y: Math.floor((event.clientY - (rect.top + (tileScale / 2))) / tileSize)
    };
}

var removeEntityAt = function(x, y) {
    // if entity exists in this spot, replace it
    var idx = -1;    
    for (var i = 0; i < entities.length; ++i) {
        if (entities[i].x == x && entities[i].y == y) {
            idx = i;
            break;
        }
    }

    if (idx != -1) {
        entities.splice(idx, 1);
    }
}

canvas.addEventListener('mouseup', function(event) {
    mousePos = getMousePos();

    // is this even possible?
    if (!inBounds(mousePos.x, mousePos.y)) { return; }

    removeEntityAt(mousePos.x, mousePos.y);

    // if brush is player-knight remove any old entity info so there's only one player

    if (mobBrush == "player-knight") {
        if (player != null) {
            removeEntityAt(player.x, player.y);
        }
        player = { x: mousePos.x, y: mousePos.y };
    }

    entities.push(new Mob(mobBrush, mousePos.x, mousePos.y));
    updateShareLink();
});


var generateBrushButtons = function() {
    var brushList = document.getElementById('brushes');

    for (let type of validBrushTypes) {        
        let btn = document.createElement("button");
        let text = document.createTextNode(type);
        
        btn.addEventListener("click", function() {
            var sel = document.getElementById("selected-brush");
            sel.innerHTML = "selected brush: " + type;
            mobBrush = type; 
        });

        btn.appendChild(text);
        brushList.appendChild(btn);
    }
}


var drawEntities = function(time) {
    for (var ent of entities) {
        if (time % 1000 < 500) {
            ctx.drawImage(ent.img, ent.realPos.x, ent.realPos.y);
        } else {
            ctx.drawImage(ent.idleImg, ent.realPos.x, ent.realPos.y);
        }
    }
}

var drawLoop = function(time) {
    ctx.drawImage(backgroundImg, 0, 0);

    drawEntities(time);
    
    requestAnimationFrame(drawLoop);
}

generateBrushButtons();
requestAnimationFrame(drawLoop);