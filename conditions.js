/**
 * Returns list of pairs [object, mouse] for each object currently under the
 * mouse cursor.
 */
function mouseOver(objectTag) {
    return hit(objectTag, gl5.mouse);
}

/**
 * Returns list of pairs [object, mouse] for each object under the mouse
 * cursor if the left button is currently pressed.
 */
function mouseDown(objectTag) {
    if (objectTag === undefined) {
        return gl5.mouse.isDown;
    }

    if (!gl5.mouse.isDown) {
        return [];
    }

    return mouseOver(objectTag);
}

/**
 * Returns list of pairs [object, mouse] for each object under the mouse
 * cursor if the left button has been pressed this frame.
 */
function clicked(objectTag) {
    if (objectTag === undefined) {
        return gl5.mouse.isClicking;
    }

    if (!gl5.mouse.isClicking) {
        return [];
    }

    return mouseOver(objectTag);
}

/**
 * Returns 'true' if the key is currently pressed, 'false' if it has been
 * released, or 'undefined' if it has never been pressed in this session.
 */
function keyDown(key) {
    return gl5.pressedKeys[key];
}

/**
 * Returns list of pairs [object, target] for each AABB* collision between
 * object and target, or between two objects if no target is given.
 * AABB*: Axis Aligned Bounding Box, collision test between the general
 * rectangles that define the area of the objects.
 */
function hit(objectTag, targetTag) {
    targetTag = targetTag === undefined ? objectTag : targetTag;
    return gl5.filter(objectTag, targetTag, function (object, target) {
        return object.hitTest(target);
    });
}

/**
 * Returns list of pairs [object, target] for each circle collision* between
 * object and target, or between two objects if no target is given.
 * circle collision*: collision test considering both objects are circles
 * with radius equal to the average size in the horizontal and vertical
 * directions.
 */
function circleHit(objectTag, targetTag) {
    return gl5.filter(objectTag, targetTag, function (object, target) {
        var distance = object.distanceTo(target),
            radiusA = (object.size.x + object.size.y) / 4,
            radiusB = (target.size.x + target.size.y) / 4;

        return distance <= radiusA + radiusB;
    });
}

/**
 * Returns list of pairs [object, target] for each object that is more than.
 * 'minDistance' from the target.
 */
function minDistance(objectTag, targetTag, maxDistance) {
    return gl5.filter(objectTag, targetTag, function (object, target) {
        return object.distanceTo(target) > maxDistance;
    });
}

/**
 * Returns list of pairs [object, target] for each object that is closer
 * to the target than 'maxDistance'.
 */
function maxDistance(objectTag, targetTag, maxDistance) {
    return gl5.filter(objectTag, targetTag, function (object, target) {
        return object.distanceTo(target) < maxDistance;
    });
}

/**
 * Returns a list of single empty pair if there is any entity with the given
 * tag, or an empty list otherwise.
 */
function exists(tag) {
    for (var i in gl5.tagged(tag)) {
        return [[]];
    }
    return [];
}
