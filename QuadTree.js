// An implementation of a range based square QuadTree.
// Which keeps leafs around if they have any nodes in them.
// Child leafs are only removed when empty.
// Querys do not check size or shape of nodes just that their origin point is inside the query radius.
// See my code pen here for more detail: http://codepen.io/LiamKarlMitchell/pen/zImip
var QuadTreeConstants = {
    useLocal: 0,
    useObject: 1,
    useObjectLocation: 2,
    useObjectPosition: 3,
    useParam: 4,
    useFunction: 5
};

function AABBCircleIntersect(circle, rectangle) {
    // Circle is x,y, radius
    // Rectangle is top left bottom right
    // We need a copy of the point
    var circle_copy = {
        x: circle.x,
        y: circle.y
    };
    // Snap our circle to the rectangle corner/side its nearest
    if(circle_copy.x > rectangle.right) {
        circle_copy.x = rectangle.right;
    } else if(circle_copy.x < rectangle.left) {
        circle_copy.x = rectangle.left;
    }
    if(circle_copy.y > rectangle.bottom) {
        circle_copy.y = rectangle.bottom;
    } else if(circle_copy.y < rectangle.top) {
        circle_copy.y = rectangle.top;
    }
    var dx = circle_copy.x - circle.x;
    var dy = circle_copy.y - circle.y;
    var distance = Math.sqrt(Math.abs((dx * dx) + (dy * dy)));
    if(distance < circle.radius) return true;
    return false;
}

function QuadTreeNode(opts) {
    if(opts === undefined) {
        throw new Error('QuadTreeNode requires opts to be defined.');
    }
    this.id = undefined;
    this.lifetime = 0;
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.size = opts.size || 1;
    this._valueAccess = QuadTreeConstants.useLocal;
    this.object = opts.object || null;
    this.type = undefined;
    if(this.object !== null) {
        if(this.object.x != undefined && this.object.y != undefined) {
            this._valueAccess = QuadTreeConstants.useObject;
        } else if(this.object.Location !== undefined) {
            this._valueAccess = QuadTreeConstants.useObjectLocation;
        } else if(this.object.position !== undefined) {
            this._valueAccess = QuadTreeConstants.useObjectPosition;
        }
        this.type = this.object.constructor.name || this.object.__proto__.constructor.name;
    }
    this.type = opts.type || this.type;
    if(opts.getParam) {
        this._getParam = opts.getParam;
        this._valueAccess = QuadTreeConstants.useParam;
    }

    if (typeof(opts.update) === 'function') {
        this.UpdateFunction = opts.update;
        this._valueAccess = QuadTreeConstants.useFunction;
    }
    this.update();
}
// Call update to refresh the tree
QuadTreeNode.prototype.update = function(delta) {
    if(delta !== undefined) this.lifetime += delta;
    switch(this._valueAccess) {
    case QuadTreeConstants.useLocal:
        // Do Nothing
        break;
    case QuadTreeConstants.useObject:
        this.x = this.object.x;
        this.y = this.object.y;
        this.size = this.object.size || 1;
        break;
    case QuadTreeConstants.useObjectLocation:
        this.x = this.object.Location.X;
        this.y = this.object.Location.Y;
        this.size = this.object.size || 1;
        break;
    case QuadTreeConstants.useObjectPosition:
        // Check if pixi loaded and if position is of pixi origin.
        this.x = this.object.position.x;
        this.y = this.object.position.y;
        // this.size = this.object.size; TODO: Get size propperly for XYZ
        // Maybe getBounds
        break;
    case QuadTreeConstants.useParam:
        this.x = this.object[this._getParam.x];
        this.y = this.object[this._getParam.y];
        this.size = this.object[this._getParam.size] || 1;
        break;
    case QuadTreeConstants.useFunction:
        var result = this.UpdateFunction.call(this.object,this,delta);
        if (result===null) return;

        this.x = result.x;
        this.y = result.y;
        this.size = result.size || this.size;
        break;
    default:
        throw new Error('Unspecified QuadTreeConstant. (' + this._valueAccess + ')');
        break;
    }
}
// Create a tree with options
// {x : 0, y: 0, size: 1000}

function QuadTree(opts) {
    this.leafs = [null, null, null, null];
    this.nodes = [];
    this.nodesHash = {};
    this.topLevel = true;
    this.level = opts.level || 0;
    if(this.level > 0) {
        this.topLevel = false;
    }
    this.nextNodeID = 1;
    QuadTreeNode.call(this, opts);
    // Set when tree splits remove when unsplit
    this.hasChildrenAreas = false;
    this.halfSize = this.size / 2;
    this.depth = opts.depth || 5;
    this.limit = opts.limit || 10;
}
QuadTree.prototype = Object.create(QuadTreeNode.prototype);
QuadTree.prototype.clear = function() {
    for(var i = 0; i < this.nodes.length; i++) {
        delete this.nodes[i].Leaf;
    }
    this.nodes = [];
    this.nodesHash = {};
    this.leafs = [null, null, null, null];
    this.hasChildrenAreas = false;
    this.nextNodeID = 1;
}
QuadTree.prototype.query = function(query) {
    var results = [];
    if(query === undefined) {
        for(var n = 0; n < this.nodes.length; n++) {
            results.push({
                distance: null,
                node: this.nodes[n],
                object: this.nodes[n].object
            });
        }
        query = {};
    } else {
        if (typeof(query.x) === 'undefined') query.x = 0;
        if (typeof(query.y) === 'undefined') query.y = 0;
        if(query.position) {
            query.x = query.position.x;
            query.y = query.position.y;
        }
        if(query.location) {
            query.x = query.location.x;
            query.y = query.location.y;
        }
        if (query.CVec3) {
            query.x = query.CVec3.X;
            query.y = query.CVec3.Z;
        }
        if(query.radius === undefined) {
            for(var n = 0; n < this.nodes.length; n++) {
                var distance = null;

                if (query.x !== undefined && query.y !== undefined) {
                    var dx = this.nodes[n].x - query.x;
                    var dy = this.nodes[n].y - query.y;
                    distance = Math.sqrt(Math.abs((dx * dx) + (dy * dy)));
                }

                results.push({
                    distance: distance,
                    node: this.nodes[n],
                    object: this.nodes[n].object
                });
            }
        } else {
            if(this.hasChildrenAreas) {
                // Check if circle intersects square for each of these
                // If so then query inside
                var circle = {
                    x: query.x,
                    y: query.y,
                    radius: query.radius
                };
                if(AABBCircleIntersect(circle, this.leafs[0].bounds)) {
                    results = results.concat(this.leafs[0].query(query));
                }
                if(AABBCircleIntersect(circle, this.leafs[1].bounds)) {
                    results = results.concat(this.leafs[1].query(query));
                }
                if(AABBCircleIntersect(circle, this.leafs[2].bounds)) {
                    results = results.concat(this.leafs[2].query(query));
                }
                if(AABBCircleIntersect(circle, this.leafs[3].bounds)) {
                    results = results.concat(this.leafs[3].query(query));
                }
            } else {
                // Check each of the nodes
                for(var n = 0; n < this.nodes.length; n++) {
                    if(this.nodes[n]) {
                        // Get distance
                        var dx = this.nodes[n].x - query.x;
                        var dy = this.nodes[n].y - query.y;
                        var distance = Math.sqrt(Math.abs((dx * dx) + (dy * dy)));
                        if(distance <= query.radius) {
                            results.push({
                                distance: distance,
                                node: this.nodes[n],
                                object: this.nodes[n].object
                            });
                        }
                    }
                }
            }
        }
    }

    if(this.topLevel) {
        // Do filter functions
        if(query.filter) {
            results = results.filter(query.filter);
        }
        if(query.type) {
            if(typeof(query.type) === 'string') {
                query.type = query.type.split(/[\s,]+/);
            }
            if(Array.isArray(query.type)) {
                results = results.filter(function(r) {
                    if(query.type.indexOf(r.node.type) >= 0) {
                        return true;
                    }
                    return false;
                });
            }
        }
        // Do sorting
        if(query.sort !== undefined) {
            if(typeof(query.sort) === 'function') {
                results = results.sort(query.sort);
            } else {
                results = results.sort(function(a, b) {
                    return a.distance - b.distance;
                });
            }
        }
    }
    return results;
}
QuadTree.prototype.update = function update(delta) {
    // I am not sure how to handle if quad tree moves? I suppose locaitons of nodes should be relative?
    QuadTreeNode.prototype.update.call(this, delta);
    // Should cache old x,y and size compare if different if so recalculate? That would probably be more work than just calculating it.
    this.bounds = {
        top: this.y,
        left: this.x,
        bottom: this.y + this.size,
        right: this.x + this.size
    };
    if(this.topLevel) {
        var i, node, leaf;
        for(i = 0; i < this.nodes.length; i++) {
            node = this.nodes[i];
            node.update(delta);
            leaf = node.Leaf;
            if(!leaf.inBounds(node)) {
                // If node is no longer in parent leaf bounds
                leaf = node.Leaf;
                leaf.removeNode(node);
                var placed = false;
                while(leaf.Parent || leaf.topLevel) {
                    if(leaf.inBounds(node)) {
                        leaf.addNode(node);
                        placed = true;
                        break;
                    }
                    if(leaf.topLevel) {
                        break;
                    }
                    leaf = leaf.Parent;
                }
                if(placed == false) {
                    console.error('node not in quad tree...');
                }
            }
        }
    }
    // If has children
    // Update Leafs
    if(this.hasChildrenAreas) {
        // Unrolled for speed
        this.leafs[0].update(delta);
        this.leafs[1].update(delta);
        this.leafs[2].update(delta);
        this.leafs[3].update(delta);
        if(!this.leafs[0].hasChildrenAreas && this.leafs[0].nodes.length === 0 && !this.leafs[1].hasChildrenAreas && this.leafs[1].nodes.length === 0 && !this.leafs[2].hasChildrenAreas && this.leafs[2].nodes.length === 0 && !this.leafs[3].hasChildrenAreas && this.leafs[3].nodes.length === 0) {
            this.hasChildrenAreas = false;
            this.leafs = [null, null, null, null];
        }
    }
}
QuadTree.prototype.inBounds = function(obj) {
    return(obj.x >= this.x && obj.x <= this.x + this.size && obj.y >= this.y && obj.y <= this.y + this.size);
}
// Returns array of unplaced nodes although this should be empty
QuadTree.prototype.putNodesInChildrenLeafs = function() {
    if(!this.hasChildrenAreas) {
        throw new Error('Cannot use putNodesInChildrenLeafs when there are no children leafs...');
        return;
    }
    var unplaced = [];
    // Place the nodes in the appropriate child leaf
    for(var i = 0; i < this.nodes.length; i++) {
        var node = this.nodes[i];
        if(this.leafs[0].inBounds(node)) {
            this.leafs[0].addNode(node);
        } else if(this.leafs[1].inBounds(node)) {
            this.leafs[1].addNode(node);
        } else if(this.leafs[2].inBounds(node)) {
            this.leafs[2].addNode(node);
        } else if(this.leafs[3].inBounds(node)) {
            this.leafs[3].addNode(node);
        } else {
            unplaced.push(node);
        }
    }
    if(!this.topLevel) { // Keep top level's node and nodes hash
        this.nodes = [];
        this.nodesHash = {};
    }
    return unplaced;
}
QuadTree.prototype.removeNode = function(value) {
    var node;
    if(value instanceof QuadTreeNode) {
        node = value;
        value = node.id;
    } else if(typeof(value) === 'number') {
        // Do nothing
    } else {
        throw new Error('Invalid value passed to QuadTree::removeNode');
        return;
    }
    if(node === undefined) {
        node = this.nodesHash[value];
    }
    if(node.Leaf !== undefined && node.Leaf !== this) {
        node.Leaf.removeNode(node);
    }
    var index = this.nodes.indexOf(node);
    if(index > -1) {
        delete this.nodesHash[node.id];
        this.nodes.splice(index, 1);
        delete node.Leaf;
    }
}
QuadTree.prototype.addNode = function(node) {
    node.Leaf = this;
    if(this.topLevel) {
        if(node instanceof QuadTreeNode === false) {
            node = new QuadTreeNode({
                object: node
            });
        }
        if(node.id === undefined) {
            node.id = this.nextNodeID;
            this.nextNodeID++;
        }
    }
    // Check any children that exist if we can add it there
    if(this.hasChildrenAreas) {
        if(this.leafs[0].inBounds(node)) {
            this.leafs[0].addNode(node);
        } else if(this.leafs[1].inBounds(node)) {
            this.leafs[1].addNode(node);
        } else if(this.leafs[2].inBounds(node)) {
            this.leafs[2].addNode(node);
        } else if(this.leafs[3].inBounds(node)) {
            this.leafs[3].addNode(node);
        } else {
            console.error('Node outside Quad Tree bounds ' + this.x + ',' + this.y + ' size ' + this.size);
            return null;
        }
        // Check if we need to create child areas
    } else if(this.depth > 0 && this.nodes.length + 1 > this.limit) {
        this.hasChildrenAreas = true;
        this.leafs[0] = new QuadTree({
            x: this.x,
            y: this.y,
            size: this.halfSize,
            limit: this.limit,
            depth: this.depth - 1,
            level: this.level + 1
        });
        this.leafs[1] = new QuadTree({
            x: this.x + this.halfSize,
            y: this.y,
            size: this.halfSize,
            limit: this.limit,
            depth: this.depth - 1,
            level: this.level + 1
        });
        this.leafs[2] = new QuadTree({
            x: this.x,
            y: this.y + this.halfSize,
            size: this.halfSize,
            limit: this.limit,
            depth: this.depth - 1,
            level: this.level + 1
        });
        this.leafs[3] = new QuadTree({
            x: this.x + this.halfSize,
            y: this.y + this.halfSize,
            size: this.halfSize,
            limit: this.limit,
            depth: this.depth - 1,
            level: this.level + 1
        });
        this.leafs[0].Parent = this;
        this.leafs[1].Parent = this;
        this.leafs[2].Parent = this;
        this.leafs[3].Parent = this;
        this.nodes.push(node);
        this.nodesHash[node.id] = node;
        // Reorganize Nodes
        this.putNodesInChildrenLeafs();
    } else if(this.topLevel === false) {
        if(this.inBounds(node)) {
            this.nodes.push(node);
            this.nodesHash[node.id] = node;
            node.Leaf = this;
        } else {
            console.error('Node outside Quad Tree bounds ' + this.x + ',' + this.y + ' size ' + this.size);
            return null;
        }
    }
    // Overall we want this in the top node...
    if(this.topLevel) {
        if(this.inBounds(node)) {
            if(this.nodesHash[node.id] !== node) {
                this.nodes.push(node);
                this.nodesHash[node.id] = node;
                if(node.Leaf === undefined) {
                    node.Leaf = this;
                }
            }
        } else {
            console.error('Node outside Quad Tree bounds ' + this.x + ',' + this.y + ' size ' + this.size);
            return null;
        }
    }
    return node;
}

QuadTree.QuadTreeConstants = QuadTreeConstants;
QuadTree.AABBCircleIntersect = AABBCircleIntersect;
QuadTree.QuadTreeNode = QuadTreeNode;

if(typeof module !== "undefined" && module.exports) {
    module.exports = QuadTree;
}
if(typeof window !== "undefined") {
    window.QuadTree = QuadTree;
}