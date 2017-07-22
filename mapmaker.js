var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var shareBox = document.getElementById("shareBox");

var player = null;
var entities = [];
var mobBrush = "player-knight";

var tileScale = 8;
var tileSize = tileScale * 9;
var tileOffset = tileScale / 2;

var backgroundImg = new Image();
backgroundImg.src = "arena-7x14.png";

var gapImg = new Image();
gapImg.src = "gap.png";

var Gap = function(x, y) {
    this.x = x;
    this.y = y;
};
var gaps = [];

var updateShareLink = function() {
    var baseLink = "http://astudyinpixels.com/ld37/index.html";

    if (player == null) {
        shareBox.innerHTML = "you must add a player to generate the share url";
        return;
    }

    var link = "?p=" + player.x + "," + player.y;
    link += "&m=";

    if (entities.length <= 1) {
        shareBox.innerHTML = "you must add at least 1 enemy to generate the share url";
        return;
    }

    // add entities to url
    for (let i = 0; i < entities.length; ++i) {
        // player is handled differently, for probably unnecessary reasons
        let ent = entities[i];
        if (ent.type != "player-knight") {
            link += ent.shortName + "," + ent.x + "," + ent.y + ",";
        }
    }
    link = link.slice(0, -1);

    // add gaps to url
    if (gaps.length > 0) {
        link += "&g=";
        for (let gap of gaps) {
            link += gap.x + "," + gap.y + ",";
        }
        link = link.slice(0, -1);
    }


    var finalLink = baseLink + link;
    shareBox.innerHTML = finalLink;

    var testMapDiv = document.getElementById("testMap");
    testMapDiv.innerHTML = "test your map by clicking <a href=" +
        finalLink + ">this</a>";
};
updateShareLink();

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


var Mob = function(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.img = new Image();
    this.img.src = type + ".png";
    this.idleImg = new Image();
    this.idleImg.src = type + "2.png";
    this.shortName = validMobShortNames[validBrushTypes.indexOf(this.type)];

    var realPos = realPosFromTilePos(x, y);
    this.realPos = { x: realPos.x, y: realPos.y };
};

// all support entity types
var validBrushTypes = [
    "player-knight",
    "skeleton",
    "ghoul",
    "demon-spear",
    "demon-mage",
    "orc-knight",
    "orc-mage",
    "black-knight",
    "TILE-GAP",
    "ERASE"
];

var validMobShortNames = [
    "pk",
    "s",
    "g",
    "ds",
    "dm",
    "ok",
    "om",
    "bk"
];

var getMousePos = function(event) {
    var rect = canvas.getBoundingClientRect();

    return {
        x: Math.floor((event.clientX - (rect.left + (tileScale / 2))) / tileSize),
        y: Math.floor((event.clientY - (rect.top + (tileScale / 2))) / tileSize)
    };
};

var removeEntityOrGapAt = function(x, y) {
    // if entity exists in this spot, replace it
    var entIdx = -1;
    for (var i = 0; i < entities.length; ++i) {
        if (entities[i].x == x && entities[i].y == y) {
            entIdx = i;
            break;
        }
    }

    var gapIdx = -1;
    for (var k = 0; k < gaps.length; ++k) {
        if (gaps[k].x == x && gaps[k].y == y) {
            gapIdx = k;
            break;
        }
    }

    if (entIdx != -1) {
        entities.splice(entIdx, 1);
    }
    if (gapIdx != -1) {
        gaps.splice(gapIdx, 1);
    }
};

canvas.addEventListener("mouseup", function(event) {
    var mousePos = getMousePos(event);

    // is this even possible?
    if (!inBounds(mousePos.x, mousePos.y)) { return }

    removeEntityOrGapAt(mousePos.x, mousePos.y);

    // if brush is eraser, update the share link and leave
    if (mobBrush == "ERASE") {
        updateShareLink();
        return;
    }

    if (mobBrush == "TILE-GAP") {
        gaps.push(new Gap(mousePos.x, mousePos.y));
        updateShareLink();
        return;
    }

    // if brush is player-knight remove any old entity info so there"s only one player
    if (mobBrush == "player-knight") {
        if (player != null) {
            removeEntityOrGapAt(player.x, player.y);
        }
        player = { x: mousePos.x, y: mousePos.y };
    }

    entities.push(new Mob(mobBrush, mousePos.x, mousePos.y));
    updateShareLink();
});


var generateBrushButtons = function() {
    var brushList = document.getElementById("brushes");
    var count = 0;

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
        count++;
        if (count % 5 == 0) {
            brushList.appendChild(document.createElement("br"));
        }
    }
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

var drawGaps = function() {
    for (var gap of gaps) {
        let realPos = realPosFromTilePos(gap.x, gap.y);
        ctx.drawImage(gapImg, realPos.x, realPos.y);
    }
};

var drawLoop = function(time) {
    ctx.drawImage(backgroundImg, 0, 0);

    drawGaps();
    drawEntities(time);

    requestAnimationFrame(drawLoop);
};

generateBrushButtons();
requestAnimationFrame(drawLoop);