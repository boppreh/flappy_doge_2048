"use strict";

var TAU = Math.PI * 2;

// Compatibility for older Firefox and Opera versions.
if (window.requestAnimationFrame === undefined) {
    window.requestAnimationFrame = function (handler) {
        return setTimeout(handler, 1000 / 60);
    }
    window.cancleAnimationFrame = function (requestId) {
        return clearTimeout(requestId);
    }
}

// Singleton object with methods created manually.
// This is the game engine itself.
var gl5 = {
    // Bigger values mean slower updating but smoother FPS calculation.
    FRAME_TIME_FILTER: 10,
    // Between 0 and 1, defines how long the old renderings should trail.
    MOTION_BLUR_STRENGTH: 0.5,
    // Key aliases.
    KEYCODE_BY_NAME: {'space': 32, 'left': 37, 'up': 38, 'right': 39,
                      'down': 40, 'esc': 27, 'enter': 13,
                      'ctrl': 17, 'alt': 9},
    // Reverse aliases (keycodes mapping to names), filled later from
    // the values of the dictionary above.
    NAME_BY_KEYCODE: {},

    // When paused, the engine still runs every frame, but nothing is
    // rendered or updated.
    paused: false,
    // {x, y} dictionary, used for centering the screen on certain objects.
    center: null,

    // Forces the HTML page to contain a canvas elemented with id 'canvas'.
    canvas: document.getElementById('canvas'),
    context: canvas.getContext('2d'),
    // Stack of layers. One initial later will be created later.
    layers: [],
    activeLayer: null,
    // Maps image sources to Image objects.
    imageCache: {},
    // Number of resources still loading (images, sounds, etc).
    nLoading: 0,

    debug: false,
    // Maps numeric keycodes to a single 'true' (is pressed), 'false' (has been
    // released) or 'undefined' (has never been seen) value.
    pressedKeys: {},

    // Used for FPS calculation.
    frameTime: 0,
    lastLoop: new Date / 1000,
    fps: 0,
    seconds: 0,

    // Entities containing position and size information, automatically
    // created and updated every frame.
    mouse: null,
    screen: null
};

/**
 * Returns an Image instance from the given source. The image may not be fully
 * loaded, but 'onLoad' is guaranteed to be called as soon the image is
 * available, with the Image instance as firsgt parameter.
 *
 * Instances are cached globally and loading images pause the engine.
 */
gl5.loadImage = function (src, onLoad) {
    var image;
    if (src.constructor == Image) {
        image = src;
    } else if (gl5.imageCache[src] === undefined) {
        image = new Image();
        gl5.nLoading++;

        image.addEventListener('load', function () {
            gl5.nLoading--;
        });       
        image.addEventListener('error', function (event) {
            console.error('Error loading image', src, event);
        });

        gl5.imageCache[src] = image;
        // Not sure if it's possible to have a race condition here
        // (JS is synchronous, but browser is not) but when in doubt
        // we set the src only at the end.
        image.src = src;
    } else {
        // Found instance in cache, but no guarantees it has finished loading.
        image = gl5.imageCache[src];
    }

    if (onLoad) {
        if (image.width > 0) {
            onLoad(image);
        } else {
            image.addEventListener('load', function () {
                onLoad(image);
            });
        }
    }

    return image;
};

/**
 * Changes the current layer to a different one. If no layer is given, a new
 * one is created on top of the current one.
 */
gl5.layer = function (layer) {
    layer = layer || new Layer();
    if (this.layers.indexOf(layer) === -1) {
        // Create new layer on top of the current one.
        var currentIndex = this.layers.indexOf(this.activeLayer);
        this.layers.splice(currentIndex + 1, 0, layer);
    }
    this.activeLayer = layer;
    return layer;
};

/**
 * Removes a given layer (or the current one by default), putting the lower
 * one in focus.
 */
gl5.unlayer = function (layer) {
    if (layer !== undefined && this.layers.indexOf(layer) === -1) {
        // Unknown layer, ignore.
        return;
    }
    layer = layer || this.activeLayer;
    var index = this.layers.indexOf(layer)
    this.layers.splice(index, 1);
    if (layer === this.activeLayer) {
        this.activeLayer = this.layers[index - 1] || this.layers[index];
    }
    return layer;
};

/**
 * Removes all but the first layer.
 */
gl5.unlayerAll = function () {
    this.layers = [this.layers[0]];
    this.activeLayer = this.layers[0];
};

/**
 * Draws all layers onto the canvas.
 */
gl5.render = function () {
    this.context.save();

    if (!this.MOTION_BLUR_STRENGTH) {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
        this.context.save();
        this.context.globalAlpha = 1 - this.MOTION_BLUR_STRENGTH;
        this.context.globalCompositeOperation = 'destination-out';
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.restore();
    }

    this.context.translate(this.screen.size.x / 2, this.screen.size.y / 2);
    this.context.rotate(this.screen.pos.angle);
    this.context.translate(-this.screen.pos.x, -this.screen.pos.y);

    for (var i in this.layers) {
        var layer = this.layers[i];
        for (var i in layer.entities) {
            this.context.save();
            layer.entities[i].render(this.context);
            this.context.restore();
        }
    }

    this.context.restore();
};

/**
 * Advances the physics one step, updating entities and calling registered
 * functions.
 */
gl5.step = function () {
    var oldActiveLayer = gl5.activeLayer;

    for (var i in gl5.layers) {
        var layer = gl5.layers[i];
        if (layer.paused || gl5.nLoading > 0) {
            continue;
        }

        gl5.activeLayer = layer;

        for (var i in layer.entities) {
            layer.entities[i].step();
        }

        // Counting down to avoid problems when removing elements inside the
        // loop.
        for (var i = layer.futureFunctions.length - 1; i >= 0; i--) {
            var time = layer.futureFunctions[i][0],
                func = layer.futureFunctions[i][1];

            if (time <= gl5.seconds) {
                layer.futureFunctions.splice(i, 1);
                func();

                if (gl5.activeLayer !== layer) {
                    // Someone is messing with layers.
                    // Throw the towel, discard the frame and let the
                    // programmer choose what will be the next active layer.
                    return;
                }
            }
        }

        for (var i in layer.behaviors) {
            layer.behaviors[i]();
            if (gl5.activeLayer !== layer) {
                return;
            }
        }
    }

    this.activeLayer = oldActiveLayer;
};

/**
 * Creates a new empty layer for managing entities and behaviors.
 */
function Layer() {
    this.paused = false;
    this.behaviors = [];
    // {entity.id: entity}
    this.entities = {};
    // {tagName: {entity.id: entity}}
    this.tags = {};
    // Used for creating unique IDs.
    this.behaviorCount = 0;
    // Contains a list of triples [time, function, layer].
    this.futureFunctions = [];
}

/**
 * Schedules a function to be called in the future, after a set delay.
 */
Layer.prototype.schedule = function (delay, func) {
    this.futureFunctions.push([gl5.seconds + delay, func]);
};

/**
 * Returns the dictionary of all entities with this tag in this layer.
 * Format: tag = {entity.id: entity}
 */
Layer.prototype.tagged = function(tag) {
    if (this.tags[tag] === undefined) {
        this.tags[tag] = {};
    }
    return this.tags[tag];
};

function isArray(obj) {
    return obj && obj.length !== undefined && typeof obj !== 'string';
}

/**
 * Executes a function for every combination of listed/tagged entity.
 * layer.forEach('enemy', destroy);
 * layer.forEach('tag name', singleEntity, [list, of, entities], callback);
 */
Layer.prototype.forEach = function (/*tags, callback*/) {
    var args = Array.prototype.slice.call(arguments, 0),
        targets = args.slice(0, -1),
        callback = args.slice(-1)[0];

    if (targets.length === 0) {
        callback();
        return;
    } else if (targets.length === 1 && isArray(targets[0]) && isArray(targets[0][0])) {
        targets[0].forEach(function(combination) {
            callback.apply(callback, combination);
        });
        return;
    }

    for (var i in targets) {
        if (typeof targets[i] === 'string') {
            targets[i] = this.tagged(targets[i]);
        } else if (targets[i].id !== undefined) {
            targets[i] = [targets[i]];
        }
    }

    function combinations(lists, previousParams, index) {
        if (lists.length === 0) {
            callback.apply(callback, previousParams);
            return;
        }

        for (var i in lists[0]) {
            previousParams[index] = lists[0][i];
            combinations(lists.slice(1), previousParams, index + 1);
        }
    }

    combinations(targets, [], 0);
};

/**
 * Returns the list of entities from the given tags that match the filter.
 * Similar to 'forEach', but return the entities which made 'filter' return
 * a truthy value.
 */
Layer.prototype.filter = function (/*tags, filter*/) {
    var args = Array.prototype.slice.call(arguments, 0),
        filter = args[args.length - 1],
        matches = [];

    // Convert filter into regular callback for 'forEach'.
    args[args.length - 1] = function () {
        var args = Array.prototype.slice.call(arguments, 0);
        if (filter.apply(filter, args)) {
            matches.push(args);
        }
    };

    this.forEach.apply(this, args);
    return matches;
};

/**
 * Registers a new function to be called every frame.
 */
Layer.prototype.register = function (behavior) {
    behavior.id = behavior.id || ++this.behaviorCount;
    behavior.layer = this;
    this.behaviors[behavior.id] = behavior;
    return behavior;
};

/**
 * Removes a previously registered behavior.
 */
Layer.prototype.unregister = function (behavior) {
    delete this.behaviors[behavior.id];
    delete behavior.id;
    delete behavior.layer;
};

/**
 * Adds an entity to this layer, including it in the tagged dictionaries.
 */
Layer.prototype.add = function (entity) {
    // Removes entity from previous layers to avoid subtle bugs.
    if (entity.layer) {
        entity.layer.remove(entity);
    }
    entity.layer = this;
    this.entities[entity.id] = entity;

    for (var tag in entity.tags) {
        this.tagged(tag)[entity.id] = entity;
    }
};

/**
 * Removes an entity from this layer.
 */
Layer.prototype.remove = function (entity) {
    delete entity.layer;
    delete this.entities[entity.id];

    for (var tag in entity.tags) {
        delete this.tagged(tag)[entity.id];
    }
};

/**
 * Creates a new AnimationEntity and adds it to the current layer.
 */
Layer.prototype.createAnimation = function (frames, tags, pos, friction) {
    var entity = new AnimatedEntity(frames, tags, pos, friction);
    this.add(entity);
    return entity;
};

/**
 * Creates a new ImageEntity and adds it to the current layer.
 */
Layer.prototype.createImage = function (image, tags, pos, friction) {
    var entity = new ImageEntity(image, tags, pos, friction);
    this.add(entity);
    return entity;
};

/**
 * Creates a new TextEntity and adds it to the current layer.
 */
Layer.prototype.createText = function (text, tags, pos, friction) {
    var entity = new TextEntity(text, tags, pos, friction);
    this.add(entity);
    return entity;
};

/**
 * Creates a new generic entity, with tags, position, friction, size and
 * inertia.
 */
function Entity(tagsList, pos, friction) {
    this.id = Entity.count++;
    this.pos = fillDefault(pos, {x: gl5.canvas.width / 2,
                                 y: gl5.canvas.height / 2,
                                 angle: 0});
    this.size = {x: 0, y: 0};
    this.inertia = {x: 0, y: 0, angle: 0};
    this.friction = fillDefault(friction, {x: 0.8, y: 0.8, angle: 0.8});

    this.alpha = 1.0;
    this.shadow = null;
    this.tags = {};

    if (tagsList === undefined) {
        tagsList = [];
    } else if (typeof tagsList === 'string') {
        tagsList = [tagsList];
    }

    for (var i in tagsList) {
        this.tag(tagsList[i]);
    }
}
Entity.count = 0;

/**
 * Removes this entity from its layer and consequently the world.
 */
Entity.prototype.destroy = function () {
    this.layer.remove(this);
};

/**
 * Render this entity in the given 2D canvas context.
 */
Entity.prototype.render = function (context) {
    context.translate(this.pos.x, this.pos.y);

    // Prints debug information. Important to do so before rotating
    // the context so the text and bounding box is not sideways.
    if (gl5.debug) {
        context.rotate(-gl5.screen.pos.angle);
        // Prints the layer and all tags on top right corner of entity, one
        // below the other.
        context.fillText('Layer ' + gl5.layers.indexOf(this.layer),
                         this.size.x / 2, -this.size.y / 2);
        var i = 1;
        for (var tag in this.tags) {
            var x = this.size.x / 2,
                y = -this.size.y / 2 + i++ * 16;

            context.fillText(tag, x, y);
        }
        context.rotate(gl5.screen.pos.angle);

        // Draws the bounding box.
        context.strokeRect(-this.size.x / 2, -this.size.y / 2,
                           this.size.x, this.size.y);
    }

    context.rotate(-this.pos.angle);
    if (this.alpha < 1) {
        context.globalAlpha = this.alpha;
    }

    if (this.shadow) {
        context.shadowColor = this.shadow.color;
        context.shadowOffsetX = this.shadow.offset.x;
        context.shadowOffsetY = this.shadow.offset.y;
        context.shadowBlur = this.shadow.blur;
    }
};

/**
 * Returns true if the given entity is touching/intersecting this entity.
 */
Entity.prototype.hitTest = function (other) {
    return !(this.pos.x - this.size.x / 2 > other.pos.x + other.size.x / 2 ||
             this.pos.x + this.size.x / 2 < other.pos.x - other.size.x / 2 ||
             this.pos.y - this.size.y / 2 > other.pos.y + other.size.y / 2 ||
             this.pos.y + this.size.y / 2 < other.pos.y - other.size.y / 2);
};

/**
 * Moves this entity's position and angle.
 */
Entity.prototype.move = function (speed) {
    this.pos.x += speed.x || 0;
    this.pos.y += speed.y || 0;
    this.pos.angle += speed.angle || 0;
    while (this.pos.angle < 0) {
        this.pos.angle += TAU;
    }
    while (this.pos.angle > TAU) {
        this.pos.angle -= TAU;
    }
};

/**
 * Accelerates this entity with the given values.
 */
Entity.prototype.push = function (acceleration) {
    this.inertia.x += acceleration.x || 0;
    this.inertia.y += acceleration.y || 0;
    this.inertia.angle += acceleration.angle || 0;
};

/**
 * Adds a new tag to this entity.
 */
Entity.prototype.tag = function (tag) {
    this.tags[tag] = tag;
    if (this.layer) {
        this.layer.tagged(tag)[this.id] = this;
    }
};

/**
 * Removes an existing tag from this entity.
 */
Entity.prototype.untag = function (tag) {
    delete this.tags[tag];
    if (this.layer) {
        delete this.layer.tagged(tag)[this.id];
    }
};

/**
 * Executes a physics step.
 */
Entity.prototype.step = function () {
    this.move(this.inertia);
    this.inertia.x *= (1 - this.friction.x);
    this.inertia.y *= (1 - this.friction.y);
    this.inertia.angle *= (1 - this.friction.angle);
    this.alpha = Math.min(Math.max(this.alpha, 0.0), 1.0);
};

/**
 * Returns the radian angle to the given entity's center.
 */
Entity.prototype.angleTo = function (otherEntity) {
    var difX = otherEntity.pos.x - this.pos.x,
        difY = otherEntity.pos.y - this.pos.y;
    return Math.atan2(-difY, difX);
};

/**
 * Returns the distance in pixels to the given entity's center.
 */
Entity.prototype.distanceTo = function (otherEntity) {
    return diagonal({x: this.pos.x - otherEntity.pos.x,
                     y: this.pos.y - otherEntity.pos.y});
};

/**
 * Creates a new entity that displays a text.
 */
function TextEntity(value, tags, pos, friction) {
    Entity.call(this, tags, pos, friction);
    this.inertia.value = this.inertia.value || 0;
    this.friction.value = this.inertia.value || 0;
    this.shadow = {color:'#222', blur: 1, offset: {x: 1, y: 1}};

    this.value = value;
    this.color = gl5.context.fillStyle;
    this.font = gl5.context.font;
    this.alignment = 'center';
    this.prefix = '';
    this.suffix = '';
    this.minDigits = 0;
    this.minValue = Number.NEGATIVE_INFINITY;
    this.maxValue = Number.POSITIVE_INFINITY;
    this.decimalPoints = 0;
}

/**
 * Pads a numeric string with left zeroes.
 */
TextEntity.pad = function pad(value, length) {
    value = value + '';
    if (value.length >= length) {
        return value;
    }
    return new Array(length - value.length + 1).join('0') + value;
};

TextEntity.prototype = Object.create(Entity.prototype);
TextEntity.prototype.constructor = TextEntity;

// Override render to display text.
TextEntity.prototype.render = function (context) {
    Entity.prototype.render.call(this, context);

    var strValue;
    if (typeof this.value === 'number') {
        strValue = this.value.toFixed(this.decimalPoints);
    } else {
        strValue = this.value;
    }
    var paddedValue = TextEntity.pad(strValue, this.minDigits),
        text = this.prefix + paddedValue + this.suffix;

    context.fillStyle = this.color;
    context.font = this.font;
    context.textAlign = this.alignment;

    // Calculates text width.
    var measure = context.measureText(text);
    this.size.x = measure.width;
    // Takes the text height from the font size in pixels.
    // Not perfect, but good enough for now.
    this.size.y = +this.font.slice(0, this.font.indexOf(' ') - 2);
    context.fillText(text, 0, this.size.y / 2);
};

// Override move to increment textual value.
TextEntity.prototype.move = function (speed) {
    if (speed.value) {
        this.value += speed.value;
    }
    Entity.prototype.move.call(this, speed);
}

// Override push to accelerate textual value.
TextEntity.prototype.push = function (acceleration) {
    if (acceleration.value) {
        this.inertia.value += acceleration.value;
    }
    Entity.prototype.push.call(this, acceleration);
}

// Overrides step to apply momentum to textual value.
TextEntity.prototype.step = function () {
    Entity.prototype.step.call(this);
    if (!isNaN(this.value)) {
        this.value += this.inertia.value;
        this.value = Math.min(Math.max(this.value, this.minValue), this.maxValue);
        this.inertia.value *= (1 - this.friction.value);
    }
}

/**
 * Creates a new Entity that displays an external image.
 */
function ImageEntity(imageSource, tags, pos, friction) {
    Entity.call(this, tags, pos, friction);
    if (!imageSource) {
        return;
    }

    var self = this;
    this.image = gl5.loadImage(imageSource, function (image) {
        if (self.size.x === 0 && self.size.y === 0) {
            self.size = {x: image.width, y: image.height};
        }
    });
}

ImageEntity.prototype = Object.create(Entity.prototype);
ImageEntity.prototype.constructor = ImageEntity;

// Overrides render to draw the image.
ImageEntity.prototype.render = function (context) {
    Entity.prototype.render.call(this, context);
    
    context.drawImage(this.image, -this.size.x / 2, -this.size.y / 2, this.size.x, this.size.y);
}

/**
 * Creates a new entity from multiple image sources in different frames.
 */
function AnimatedEntity(frameSources, tags, pos, friction) {
    Entity.apply(this, tags, pos, friction);
    if (frameSources === undefined) {
        return;
    }
    this.frames = [];
    this.frame = 0;
    for (var i in frameSources) {
        this.frames[i] = gl5.loadImage(frameSources[i]);
    }
}

AnimatedEntity.prototype = Object.create(ImageEntity.prototype);
AnimatedEntity.prototype.constructor = AnimatedEntity;

// Override render to draw current frame image.
AnimatedEntity.prototype.render = function (context) {
    var n = this.frames.length;
        this.frame = ((this.frame % n) + n) % n
        this.image = this.frames[this.frame];

    ImageEntity.prototype.draw.call(this, context);
}

/**
 * Invokes `callback` with `args` every time the objects tagged with
 * `objectTag` is clicked.
 */
function button(objectTag, callback, args) {
    if (gl5.activeLayer.buttons === undefined) {
        gl5.activeLayer.buttons = [];
        gl5.register(function () {
            if (!gl5.mouse.isClicking) {
                return;
            }

            gl5.forEach(gl5.activeLayer.buttons, function (button) {
                if (button.alpha && button.hitTest(gl5.mouse)) {
                    button.buttonCallback.apply(button, button.buttonArgs);
                }
            });
        });
    }    

    gl5.forEach(objectTag, function (object) {
        object.buttonCallback = callback;
        object.buttonArgs = args;
        gl5.activeLayer.buttons.push(object);
    });
}

/**
 * Returns a new object with properties between the min and max values given,
 * or between 0 and the minValues, if maxValues is not provided.
 */
function rand(minValues, maxValues) {
    maxValues = maxValues === undefined ? {} : maxValues;
    var obj = {};

    for (var property in minValues) {
        var min = minValues[property] || 0,
            max = maxValues[property] || 0;

        if (max === undefined) {
            obj[property] = min;
            continue;
        }

        obj[property] = Math.random() * (max - min) + min;
    }

    return obj;
}

/**
 * Returns a new object with random x and y properties from a given center
 * object and a radius.
 */
function randOnCircle(center, radius) {
    var angle = Math.random() * TAU;
    return  {x: center.x + Math.cos(angle) * radius,
             y: center.y + Math.sin(angle) * radius};
}

/**
 * Creates a new object with the values from 'original', where defined, or
 * else from the 'def' object.
 */
function fillDefault(original, def) {
    original = original || {};
    var obj = {};

    for (var property in def) {
        var cur = original[property];
        obj[property] = cur !== undefined ? cur : def[property];
    }

    return obj;
}

function diagonal(pos) {
    return Math.sqrt(pos.x * pos.x + pos.y * pos.y);
}

// Initialization code, put inside a function to avoid polluting the global
// namespace.
(function () {
    // Default layer.
    gl5.layer(new Layer());
    // Copy layer methods to GL5 object, using the active layer where needed.
    // The goal is to be able to use 'gl5.methodName()' instead of
    // 'gl5.activeLayer.methodName()'.
    for (var i in gl5.activeLayer) {
        if (typeof gl5.activeLayer[i] === 'function') {
            // Call anon function to store property name and value in closure.
            (function () {
                var property = i,
                    value = gl5.activeLayer[property];
                gl5[property] = function () {
                    return gl5.activeLayer[property].apply(gl5.activeLayer, arguments);
                };
            }());
        }
    }

    // Pseudo-entities.
    gl5.mouse = new Entity();
    gl5.mouse.isDown = false;
    gl5.mouse.isClicking = false;
    gl5.screen = new Entity();
    gl5.screen.pos = {_x: gl5.canvas.width / 2,
                      _y: gl5.canvas.height / 2,
                      _angle: 0};
    gl5.screen.pos.__defineGetter__('x', function () {
        return gl5.screen.pos._x;
    });
    gl5.screen.pos.__defineGetter__('y', function () {
        return gl5.screen.pos._y;
    });
    gl5.screen.pos.__defineGetter__('angle', function () {
        return gl5.screen.pos._angle;
    });

    gl5.screen.pos.__defineSetter__('x', function (value) {
        gl5.screen.pos._x = value;
    });
    gl5.screen.pos.__defineSetter__('y', function (value) {
        gl5.screen.pos._y = value;
    });
    gl5.screen.pos.__defineSetter__('angle', function (value) {
        gl5.screen.pos._angle = value;
    });

    gl5.screen.size = {_x: gl5.canvas.width,
                       _y: gl5.canvas.height};
    gl5.screen.size.__defineGetter__('x', function () {
        return gl5.screen.size._x;
    });
    gl5.screen.size.__defineGetter__('y', function () {
        return gl5.screen.size._y;
    });

    gl5.screen.size.__defineSetter__('x', function (value) {
        gl5.screen.size._x = value;
        gl5.canvas.width = value;
    });
    gl5.screen.size.__defineSetter__('y', function (value) {
        gl5.screen.size._y = value;
        gl5.canvas.height = value;
    });

    // Setup NAME_BY_KEYCODE dict with values from KEYCODE_BY_NAME.
    for (var name in gl5.KEYCODE_BY_NAME) {
        gl5.NAME_BY_KEYCODE[gl5.KEYCODE_BY_NAME[name]] = name;
    }

    // Default text properties, used for debug text (layer name, tags, fps).
    gl5.context.textAlign = 'right'
    gl5.context.fillStyle = 'green';
    gl5.context.font = '16px Verdana';

    function processKeyEvent(event, value) {
        var keycode = event.which,
            hasCtrl = event.ctrlKey,
            isKnownSpecial = keycode in gl5.NAME_BY_KEYCODE,
            isAlpha = keycode >= 48 && keycode <= 90;

        gl5.pressedKeys[keycode] = value;
        if (isKnownSpecial) {
            gl5.pressedKeys[gl5.NAME_BY_KEYCODE[keycode]] = value;
        }
        if (isAlpha) {
            gl5.pressedKeys[String.fromCharCode(keycode).toUpperCase()] = value;
            gl5.pressedKeys[String.fromCharCode(keycode).toLowerCase()] = value;
        }

        if (!hasCtrl && (isKnownSpecial || isAlpha)) {
            event.preventDefault();
        }
    };

    function updateMousePosition(event) {
        var canvasBounds = gl5.canvas.getBoundingClientRect();
        var mouseX = event.clientX - canvasBounds.left,
            mouseY = event.clientY - canvasBounds.top;

        gl5.mouse.inertia.x = mouseX - gl5.mouse.pos.x;
        gl5.mouse.inertia.y = mouseY - gl5.mouse.pos.y;

        gl5.mouse.pos.x = mouseX;
        gl5.mouse.pos.y = mouseY;
    }

    window.addEventListener('mouseenter', updateMousePosition, false);
    window.addEventListener('mouseover', updateMousePosition, false);
    window.addEventListener('mousemove', updateMousePosition, false);

    window.addEventListener('mousedown', function (event) {
        gl5.mouse.isClicking = true;
        gl5.mouse.isDown = true;
    }, false);

    window.addEventListener('mouseup', function (event) {
        gl5.mouse.isClicking = false;
        gl5.mouse.isDown = false;
    }, false);

    window.addEventListener('keydown', function (event) {
        processKeyEvent(event, true);
    }, false);

    window.addEventListener('keyup', function (event) {
        processKeyEvent(event, false);
    }, false);

    // Main gameloop, kept hidden to avoid double execution.
    function run() {
        window.requestAnimationFrame(run);
        if (gl5.paused) {
            return;
        }

        var currentLoop = new Date / 1000;
        var timeDif = currentLoop - gl5.lastLoop;
        gl5.lastLoop = currentLoop;
        gl5.frameTime += (timeDif - gl5.frameTime) / gl5.FRAME_TIME_FILTER;
        gl5.fps = (1 / gl5.frameTime).toFixed(1);

        gl5.seconds += gl5.frameTime;

        gl5.step();
        gl5.render();

        gl5.mouse.isClicking = false;

        if (gl5.debug) {
            gl5.context.fillText(gl5.fps + ' fps', gl5.canvas.width, 20);
        }
    }

    run();
}());
