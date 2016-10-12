/**
 * Moves each entity with the speed provided.
 */
function move(objectTag, speed) {
    gl5.forEach(objectTag, function (object) {
        object.move(speed);
    })
}

/**
 * Moves every source to the target position.
 */
function moveTo(sourceTag, targetTag) {
    gl5.forEach(sourceTag, targetTag, function (source, target) {
        source.pos.x = target.pos.x;
        source.pos.y = target.pos.y;
    });
}

/**
 * Accelerates each object with the given values.
 */
function push(target, acceleration) {
    gl5.forEach(target, function (object) {
        object.push(acceleration);
    });
}

/**
 * Accelerates each object in the given direction.
 */
function pushAngle(target, force, angle) {
    force = force === undefined ? 1 : force;
    angle = angle === undefined ? TAU / 4 : angle;

    gl5.forEach(target, function (object) {
        object.push({x: Math.cos(TAU - angle) * force, y: Math.sin(TAU - angle) * force});
    });
}

/**
 * Steers and moves forward each object in the direction of the target.
 */
function follow(objTag, targetTag, force, maxTolerableDistance, turningSpeed) {
    force = force !== undefined ? force : 5;
    turningSpeed = turningSpeed !== undefined ? turningSpeed : TAU / 4;
    maxTolerableDistance = maxTolerableDistance !== undefined ? maxTolerableDistance : 10;

    gl5.forEach(objTag, targetTag, function (object, target) {
        var distance = object.distanceTo(target);
            angle = object.angleTo(target),
            totalAngularDifference = angle - object.pos.angle;

        if (totalAngularDifference > TAU / 2) {
            totalAngularDifference -= TAU;
        } else if (totalAngularDifference < -TAU / 2) {
            totalAngularDifference += TAU;
        }

        if (Math.abs(totalAngularDifference) <= turningSpeed) {
            object.pos.angle = angle;
        } else if (totalAngularDifference > 0) {
            object.pos.angle += turningSpeed;
        } else {
            object.pos.angle -= turningSpeed;
        }        

        if ((force > 0 && distance <= maxTolerableDistance) ||
            (force < 0 && distance >= maxTolerableDistance)) {
            return;
        }

        pushAngle(object, force, object.pos.angle);
    });
}

/**
 * Makes the targets pull the objects.
 */
function attract(objectTag, targetTag, constantForce, elasticForce) {
    constantForce = constantForce === undefined ? 5 : constantForce;
    elasticForce = elasticForce === undefined ? 0 : elasticForce;

    gl5.forEach(objectTag, targetTag, function (object, target) { 
        var angle = object.angleTo(target),
            distance = object.distanceTo(target),
            f = constantForce + 1 / distance * elasticForce;

        pushAngle(object, f, angle);
    });
}

function wrap(target, start, end) {
    if (end === undefined && start !== undefined) {
        end = start;
        start = undefined;
    }

    start = start || {x: 0, y: 0};
    end = end || {x: canvas.width, y: canvas.height};
    var size = {x: end.x - start.x, y: end.y - start.y};

    gl5.forEach(target, function (object) {
        var pos = object.pos;

        if (pos.x < start.x) {
            pos.x += size.x;
        } else if (pos.x > end.x) {
            pos.x -= size.x;
        }

        if (pos.y < start.y) {
            pos.y += size.y;
        } else if (pos.y > end.y) {
            pos.y -= size.y;
        }
    });
}

function reflect(target, start, end) {
    if (end === undefined && start !== undefined) {
        end = start;
        start = undefined;
    }

    start = start || {x: 0, y: 0};
    end = end || {x: gl5.canvas.width, y: gl5.canvas.height};

    gl5.forEach(target, function (object) {
        var pos = object.pos;
        var inertia = object.inertia;

        for (var property in start) {
            if (pos[property] < start[property]) {
                inertia[property] = Math.abs(inertia[property]);
            } else if (pos[property] > end[property]) {
                inertia[property] = -Math.abs(inertia[property]);
            }
        }
    });
}

function limit(target, start, end) {
    if (end === undefined && start !== undefined) {
        end = start;
        start = undefined;
    }

    start = start || {x: 0, y: 0};
    end = end || {x: canvas.width, y: canvas.height};

    gl5.forEach(target, function (object) {
        var pos = object.pos;

        for (var property in start) {
            if (pos[property] < start[property]) {
                pos[property] = start[property];
                object.inertia[property] = 0;
            } else if (pos[property] > end[property]) {
                pos[property] = end[property];
                object.inertia[property] = 0;
            }
        }
    });
}

/**
 * Generates a new entity from the tip of the source, moving with a given
 * force and in the same direction as the source.
 */
function shoot(origin, imgSource, tags, force, friction) {
    force = force === undefined ? 10 : force;
    friction = fillDefault(friction, {x: 0.0, y: 0.0});
    gl5.forEach(origin, function (obj) {
        var angle = obj.pos.angle,
            distance = (obj.size.x + obj.size.y) / 2;

        var b = gl5.createImage(imgSource, tags);
        b.pos = {x: obj.pos.x + Math.cos(angle) * distance,
                 y: obj.pos.y -Math.sin(angle) * distance,
                 angle: angle};
        b.friction = friction;
        pushAngle(b, force, b.pos.angle);
    });
}

/**
 * Removes momentum from the entities.
 */
function slowDown(tag, slowness) {
    slowness = fillDefault(slowness, {x: 0.5, y: 0.5, angle: 0.5});
    gl5.forEach(tag, function (object) {
        object.inertia.x *= 1 - slowness.x;
        object.inertia.y *= 1 - slowness.y;
        object.inertia.angle *= 1 - slowness.angle;
    });
}

/**
 * Replaces the tags in two groups of entities.
 */
function swapTags(firstTag, secondTag) {
    gl5.forEach(function () {
        gl5.forEach(firstTag, function (object) {
            object.untag(firstTag); 
            object.tag('temporary swap tag'); 
        });
        gl5.forEach(secondTag, function (object) {
            object.untag(secondTag); 
            object.tag(firstTag); 
        });
        gl5.forEach('temporary swap tag', function (object) {
            object.tag(secondTag); 
            object.untag('temporary swap tag'); 
        });
    });
}

/**
 * Tags every target with a new tag.
 */
function tag(targets, tag) {
    gl5.forEach(targets, function (target) {
        target.tag(tag);
    });
}

/**
 * Removes a tag from every target.
 */
function untag(targets, tag) {
    gl5.forEach(targets, function (target) {
        target.untag(tag);
    });
}

/**
 * Plays a sound
 */
function sound(src) {
    new Audio(src).play();
}

/**
 * Destroys all target objects.
 */
function destroy(tag) {
    gl5.forEach(tag, function (object) {
        object.destroy();
    });
}

/**
 * Decrements the target's alpha until it becomes 0 and the object is
 * destroyed.
 */
function fadeOut(tag, speed) {
    speed = speed === undefined ? 0.05 : speed;

    gl5.forEach(tag, function (object) {
        object.alpha -= speed;
        if (object.alpha <= 0) {
            object.destroy();
        }
    });
}

/**
 * Increments the target's alpha.
 */
function fadeIn(tag, speed) {
    speed = speed === undefined ? 0.05 : speed;

    gl5.forEach(tag, function (object) {
        object.alpha += speed;
    });
}

/**
 * Resizes every target with a given multiplier.
 */
function resize(tag, speed) {
    if (speed === undefined) {
        speed = {x: 0.01, y: 0.01};
    } else if (typeof speed === 'number') {
        speed = {x: speed, y: speed};
    }

    gl5.forEach(tag, function (object) {
        object.size.x = Math.max(0, object.size.x * (1 + speed.x));
        object.size.y = Math.max(0, object.size.y * (1 + speed.y));
    });
}

/**
 * Sets the alpha amount of each entity.
 */
function alpha(object, amount) {
    amount = amount === undefined ? 0.5 : amount;

    gl5.forEach(object, function (object) {
        object.alpha = amount;
    });
}

/**
 * Adds a glow to every entity.
 */
function glow(object, color, blur) {
    blur = blur === undefined ? 5 : blur;

    gl5.forEach(object, function (object) {
        object.shadow = {color:color, blur: blur, offset: {x: 0, y: 0}};
    });
}

/**
 * Adds a shadow to every entity.
 */
function shadow(object, blur, offset, color) {
    offset = fillDefault(offset, {x: 1, y: 1});
    blur = blur === undefined ? 5 : blur;
    color = color || 'black';

    gl5.forEach(object, function (object) {
        object.shadow = {color:color, blur: blur, offset: offset};
    });
}

/**
 * Allows the user to control the target entities using the four directions.
 */
function keyboardControl(objectTag, force, frictionAmount, controls) {
    controls = controls || ['up', 'down', 'left', 'right'];
    force = force === undefined ? 8 : force;

    var up = gl5.pressedKeys[controls[0]] || false,
        down = gl5.pressedKeys[controls[1]] || false,
        left = gl5.pressedKeys[controls[2]] || false,
        right = gl5.pressedKeys[controls[3]] || false,
        angle = Math.atan2(up - down, right - left);

    if (!up && !down && !right && !left) {
        return;
    }

    gl5.forEach(objectTag, function (object) {
        if (frictionAmount !== undefined) {
            object.friction.x = frictionAmount;
            object.friction.y = frictionAmount;
        }

        pushAngle(object, force, angle);
    });
}

/**
 * Allows the user to control the target entities, with left/right as
 * steering and up/down as throttle.
 */
function keyboardAngularControl(objectTag, force, angularForce, frictionAmount, controls) {
    controls = controls || ['up', 'down', 'left', 'right'];
    force = force === undefined ? 8 : force;
    angularForce = angularForce === undefined ? TAU / 100 : angularForce;

    var up = gl5.pressedKeys[controls[0]] || false,
        down = gl5.pressedKeys[controls[1]] || false,
        left = gl5.pressedKeys[controls[2]] || false,
        right = gl5.pressedKeys[controls[3]] || false,
        angleChange = (left - right) * angularForce,
        impulse = (up - down) * force;

    gl5.forEach(objectTag, function (object) {
        if (frictionAmount !== undefined) {
            object.friction.x = frictionAmount;
            object.friction.y = frictionAmount;
        }

        push(object, {angle: angleChange});
        pushAngle(object, impulse, object.pos.angle);
    });
}

/**
 * Increments the target's frame by the given speed.
 */
function play(objectTag, speed) {
    speed = speed === undefined ? 1 : 0;
    gl5.forEach(objectTag, function (object) {
        object.frame += speed;
    });
}

/**
 * Damages each target. When the target's health reaches 0, it is destroyed.
 */
function damage(targets, damageAmount, onDeath, defaultHealth) {
    damageAmount = damageAmount === undefined ? 1 : damageAmount;
    defaultHealth = defaultHealth === undefined ? 100 : defaultHealth;
    onDeath = onDeath || destroy;

    gl5.forEach(targets, function (target) {
        if (target.health === undefined ) {
            target.health = defaultHealth;
        }
        target.health -= damageAmount

        if (target.health <= 0) {
            onDeath(target);
        }
    })
}

/**
 * Creates a new timer that invokes the callback every interval for every target.
 */
function Timer(interval, targets, callback) {
    if (callback === undefined) {
        callback = targets;
        targets = gl5.screen;
    }

    this.lastTimeById = {};
    this._interval = interval;
    this.paused = false;
    var self = this;

    this.__defineSetter__('interval', function (value) {
        if (value == self._interval) {
            return;
        }

        self._interval = value;
        self.reset();
    });

    this.__defineGetter__('interval', function () {
        return self._interval;
    });

    gl5.register(function () {
        gl5.forEach(targets, function (target) {
            if (self.paused) {
                return;
            }

            if (self.lastTimeById[target.id] === undefined) {
                self.lastTimeById[target.id] = gl5.seconds;
                callback(target);
            }

            while (self.lastTimeById[target.id] + self.interval <= gl5.seconds) {
                self.lastTimeById[target.id] += self.interval;
                callback(target);
            }
        });
    });
}

/**
 * Resets the timer for all targets.
 */
Timer.prototype.reset = function() {
    this.lastTimeById = {};
}