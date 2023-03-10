/*
 * Copyright (C) 2011-2012 by Nikhil Marathe <nsm.nikhil@gmail.com>
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
"use strict";

var assert = require('assert');
var node_constants = require('constants');
var constants = require('./constants');
var dgram = require('dgram');
var _ = require('underscore');
var hat = require('hat');

/**
 * RPC
 * @constructor
 */
exports.RPC = function(bindAddress, callback) {
    this._socket = dgram.createSocket('udp4', _.bind(this._onMessage, this));
    this._socket.bind(bindAddress.port, bindAddress.address || undefined);
    this._callback = callback;
    this._rack = hat.rack(constants.B);
    this._awaitingReply = {};

    // every node requires only one of these this way
    setInterval(_.bind(this._expireRPCs, this), constants.T_RESPONSETIMEOUT + 5);
};

/**
 * 분산 탐색 네트워크 내 데이터 허브 간 UDP 통신을 전송함.
 * @method
 * @param node - UDP 통신을 전송할 대상 노드 end point
 * @param message - (buffer) UDP 통신을 통해 전송할 데이터
 */
exports.RPC.prototype.send = function(node, message, callback) {
    if (!node)
        return;
    assert(node.port);
    assert(node.address);
    _.extend(message, { rpcID: this._rack() });
    var data = new Buffer(JSON.stringify(message), 'utf8');
    // console.log("[rpc->send function] message:")
    // console.log(message)
    this._socket.send(data, 0, data.length, node.port, node.address);
    if (_.isFunction(callback)) { // only store rpcID if we are expecting a reply
        this._awaitingReply[message.rpcID] = { timestamp: Date.now(), callback: callback };
    }
};

/**
 * 기 연결되어 있는 UDP 통신 소켓을 종료하는 함수.
 * @method
 */
exports.RPC.prototype.close = function() {
    this._socket.close();
};

/**
 * UDP 통신을 전송하는 함수.
 * @method
 * @private
 * @param data - UDF 메시지
 */
exports.RPC.prototype._onMessage = function(data, rinfo) {
    var message;
    try {
        message = JSON.parse(data.toString('utf8'));
    } catch (e) {
        /* we simply drop the message, although this reduces the reliability of the overall network,
         * we really don't want to implement a reliable network over UDP until it is really required.
         */
        return;
    }
    if (message.replyTo && this._awaitingReply.hasOwnProperty(message.replyTo)) {
        var cb = this._awaitingReply[message.replyTo].callback;
        delete this._awaitingReply[message.replyTo];
        cb(null, message);
        return;
    }
    this._callback(message);
};

/**
 * UDP 통신 중 RESPONSE TIMEOUT 을 초과할 경우, 해당 통신을 종료함.
 * @method
 * @private
 */
exports.RPC.prototype._expireRPCs = function() {
    var now = Date.now();
    var discarded = 0;
    _.keys(this._awaitingReply).forEach(_.bind(function(k) {
        if (now - this._awaitingReply[k].timestamp > constants.T_RESPONSETIMEOUT) {
            this._awaitingReply[k].callback({
                errno: node_constants.ETIMEDOUT,
                code: 'ETIMEDOUT',
                rpcID: k
            }, null);
            delete this._awaitingReply[k];
            discarded++;
        }
    }, this));
};
