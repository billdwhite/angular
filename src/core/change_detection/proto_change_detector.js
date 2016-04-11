'use strict';var lang_1 = require('angular2/src/facade/lang');
var exceptions_1 = require('angular2/src/facade/exceptions');
var collection_1 = require('angular2/src/facade/collection');
var ast_1 = require('./parser/ast');
var change_detection_util_1 = require('./change_detection_util');
var dynamic_change_detector_1 = require('./dynamic_change_detector');
var directive_record_1 = require('./directive_record');
var event_binding_1 = require('./event_binding');
var coalesce_1 = require('./coalesce');
var proto_record_1 = require('./proto_record');
var DynamicProtoChangeDetector = (function () {
    function DynamicProtoChangeDetector(_definition) {
        this._definition = _definition;
        this._propertyBindingRecords = createPropertyRecords(_definition);
        this._eventBindingRecords = createEventRecords(_definition);
        this._propertyBindingTargets = this._definition.bindingRecords.map(function (b) { return b.target; });
        this._directiveIndices = this._definition.directiveRecords.map(function (d) { return d.directiveIndex; });
    }
    DynamicProtoChangeDetector.prototype.instantiate = function () {
        return new dynamic_change_detector_1.DynamicChangeDetector(this._definition.id, this._propertyBindingRecords.length, this._propertyBindingTargets, this._directiveIndices, this._definition.strategy, this._propertyBindingRecords, this._eventBindingRecords, this._definition.directiveRecords, this._definition.genConfig);
    };
    return DynamicProtoChangeDetector;
})();
exports.DynamicProtoChangeDetector = DynamicProtoChangeDetector;
function createPropertyRecords(definition) {
    var recordBuilder = new ProtoRecordBuilder();
    collection_1.ListWrapper.forEachWithIndex(definition.bindingRecords, function (b, index) { return recordBuilder.add(b, definition.variableNames, index); });
    return coalesce_1.coalesce(recordBuilder.records);
}
exports.createPropertyRecords = createPropertyRecords;
function createEventRecords(definition) {
    // TODO: vsavkin: remove $event when the compiler handles render-side variables properly
    var varNames = collection_1.ListWrapper.concat(['$event'], definition.variableNames);
    return definition.eventRecords.map(function (er) {
        var records = _ConvertAstIntoProtoRecords.create(er, varNames);
        var dirIndex = er.implicitReceiver instanceof directive_record_1.DirectiveIndex ? er.implicitReceiver : null;
        return new event_binding_1.EventBinding(er.target.name, er.target.elementIndex, dirIndex, records);
    });
}
exports.createEventRecords = createEventRecords;
var ProtoRecordBuilder = (function () {
    function ProtoRecordBuilder() {
        this.records = [];
    }
    ProtoRecordBuilder.prototype.add = function (b, variableNames, bindingIndex) {
        var oldLast = collection_1.ListWrapper.last(this.records);
        if (lang_1.isPresent(oldLast) && oldLast.bindingRecord.directiveRecord == b.directiveRecord) {
            oldLast.lastInDirective = false;
        }
        var numberOfRecordsBefore = this.records.length;
        this._appendRecords(b, variableNames, bindingIndex);
        var newLast = collection_1.ListWrapper.last(this.records);
        if (lang_1.isPresent(newLast) && newLast !== oldLast) {
            newLast.lastInBinding = true;
            newLast.lastInDirective = true;
            this._setArgumentToPureFunction(numberOfRecordsBefore);
        }
    };
    /** @internal */
    ProtoRecordBuilder.prototype._setArgumentToPureFunction = function (startIndex) {
        var _this = this;
        for (var i = startIndex; i < this.records.length; ++i) {
            var rec = this.records[i];
            if (rec.isPureFunction()) {
                rec.args.forEach(function (recordIndex) { return _this.records[recordIndex - 1].argumentToPureFunction = true; });
            }
            if (rec.mode === proto_record_1.RecordType.Pipe) {
                rec.args.forEach(function (recordIndex) { return _this.records[recordIndex - 1].argumentToPureFunction = true; });
                this.records[rec.contextIndex - 1].argumentToPureFunction = true;
            }
        }
    };
    /** @internal */
    ProtoRecordBuilder.prototype._appendRecords = function (b, variableNames, bindingIndex) {
        if (b.isDirectiveLifecycle()) {
            this.records.push(new proto_record_1.ProtoRecord(proto_record_1.RecordType.DirectiveLifecycle, b.lifecycleEvent, null, [], [], -1, null, this.records.length + 1, b, false, false, false, false, null));
        }
        else {
            _ConvertAstIntoProtoRecords.append(this.records, b, variableNames, bindingIndex);
        }
    };
    return ProtoRecordBuilder;
})();
exports.ProtoRecordBuilder = ProtoRecordBuilder;
var _ConvertAstIntoProtoRecords = (function () {
    function _ConvertAstIntoProtoRecords(_records, _bindingRecord, _variableNames, _bindingIndex) {
        this._records = _records;
        this._bindingRecord = _bindingRecord;
        this._variableNames = _variableNames;
        this._bindingIndex = _bindingIndex;
    }
    _ConvertAstIntoProtoRecords.append = function (records, b, variableNames, bindingIndex) {
        var c = new _ConvertAstIntoProtoRecords(records, b, variableNames, bindingIndex);
        b.ast.visit(c);
    };
    _ConvertAstIntoProtoRecords.create = function (b, variableNames) {
        var rec = [];
        _ConvertAstIntoProtoRecords.append(rec, b, variableNames, null);
        rec[rec.length - 1].lastInBinding = true;
        return rec;
    };
    _ConvertAstIntoProtoRecords.prototype.visitImplicitReceiver = function (ast) { return this._bindingRecord.implicitReceiver; };
    _ConvertAstIntoProtoRecords.prototype.visitInterpolation = function (ast) {
        var args = this._visitAll(ast.expressions);
        return this._addRecord(proto_record_1.RecordType.Interpolate, 'interpolate', _interpolationFn(ast.strings), args, ast.strings, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitLiteralPrimitive = function (ast) {
        return this._addRecord(proto_record_1.RecordType.Const, 'literal', ast.value, [], null, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitPropertyRead = function (ast) {
        var receiver = ast.receiver.visit(this);
        if (lang_1.isPresent(this._variableNames) && collection_1.ListWrapper.contains(this._variableNames, ast.name) &&
            ast.receiver instanceof ast_1.ImplicitReceiver) {
            return this._addRecord(proto_record_1.RecordType.Local, ast.name, ast.name, [], null, receiver);
        }
        else {
            return this._addRecord(proto_record_1.RecordType.PropertyRead, ast.name, ast.getter, [], null, receiver);
        }
    };
    _ConvertAstIntoProtoRecords.prototype.visitPropertyWrite = function (ast) {
        if (lang_1.isPresent(this._variableNames) && collection_1.ListWrapper.contains(this._variableNames, ast.name) &&
            ast.receiver instanceof ast_1.ImplicitReceiver) {
            throw new exceptions_1.BaseException("Cannot reassign a variable binding " + ast.name);
        }
        else {
            var receiver = ast.receiver.visit(this);
            var value = ast.value.visit(this);
            return this._addRecord(proto_record_1.RecordType.PropertyWrite, ast.name, ast.setter, [value], null, receiver);
        }
    };
    _ConvertAstIntoProtoRecords.prototype.visitKeyedWrite = function (ast) {
        var obj = ast.obj.visit(this);
        var key = ast.key.visit(this);
        var value = ast.value.visit(this);
        return this._addRecord(proto_record_1.RecordType.KeyedWrite, null, null, [key, value], null, obj);
    };
    _ConvertAstIntoProtoRecords.prototype.visitSafePropertyRead = function (ast) {
        var receiver = ast.receiver.visit(this);
        return this._addRecord(proto_record_1.RecordType.SafeProperty, ast.name, ast.getter, [], null, receiver);
    };
    _ConvertAstIntoProtoRecords.prototype.visitMethodCall = function (ast) {
        var receiver = ast.receiver.visit(this);
        var args = this._visitAll(ast.args);
        if (lang_1.isPresent(this._variableNames) && collection_1.ListWrapper.contains(this._variableNames, ast.name)) {
            var target = this._addRecord(proto_record_1.RecordType.Local, ast.name, ast.name, [], null, receiver);
            return this._addRecord(proto_record_1.RecordType.InvokeClosure, 'closure', null, args, null, target);
        }
        else {
            return this._addRecord(proto_record_1.RecordType.InvokeMethod, ast.name, ast.fn, args, null, receiver);
        }
    };
    _ConvertAstIntoProtoRecords.prototype.visitSafeMethodCall = function (ast) {
        var receiver = ast.receiver.visit(this);
        var args = this._visitAll(ast.args);
        return this._addRecord(proto_record_1.RecordType.SafeMethodInvoke, ast.name, ast.fn, args, null, receiver);
    };
    _ConvertAstIntoProtoRecords.prototype.visitFunctionCall = function (ast) {
        var target = ast.target.visit(this);
        var args = this._visitAll(ast.args);
        return this._addRecord(proto_record_1.RecordType.InvokeClosure, 'closure', null, args, null, target);
    };
    _ConvertAstIntoProtoRecords.prototype.visitLiteralArray = function (ast) {
        var primitiveName = "arrayFn" + ast.expressions.length;
        return this._addRecord(proto_record_1.RecordType.CollectionLiteral, primitiveName, _arrayFn(ast.expressions.length), this._visitAll(ast.expressions), null, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitLiteralMap = function (ast) {
        return this._addRecord(proto_record_1.RecordType.CollectionLiteral, _mapPrimitiveName(ast.keys), change_detection_util_1.ChangeDetectionUtil.mapFn(ast.keys), this._visitAll(ast.values), null, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitBinary = function (ast) {
        var left = ast.left.visit(this);
        switch (ast.operation) {
            case '&&':
                var branchEnd = [null];
                this._addRecord(proto_record_1.RecordType.SkipRecordsIfNot, 'SkipRecordsIfNot', null, [], branchEnd, left);
                var right = ast.right.visit(this);
                branchEnd[0] = right;
                return this._addRecord(proto_record_1.RecordType.PrimitiveOp, 'cond', change_detection_util_1.ChangeDetectionUtil.cond, [left, right, left], null, 0);
            case '||':
                var branchEnd = [null];
                this._addRecord(proto_record_1.RecordType.SkipRecordsIf, 'SkipRecordsIf', null, [], branchEnd, left);
                var right = ast.right.visit(this);
                branchEnd[0] = right;
                return this._addRecord(proto_record_1.RecordType.PrimitiveOp, 'cond', change_detection_util_1.ChangeDetectionUtil.cond, [left, left, right], null, 0);
            default:
                var right = ast.right.visit(this);
                return this._addRecord(proto_record_1.RecordType.PrimitiveOp, _operationToPrimitiveName(ast.operation), _operationToFunction(ast.operation), [left, right], null, 0);
        }
    };
    _ConvertAstIntoProtoRecords.prototype.visitPrefixNot = function (ast) {
        var exp = ast.expression.visit(this);
        return this._addRecord(proto_record_1.RecordType.PrimitiveOp, 'operation_negate', change_detection_util_1.ChangeDetectionUtil.operation_negate, [exp], null, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitConditional = function (ast) {
        var condition = ast.condition.visit(this);
        var startOfFalseBranch = [null];
        var endOfFalseBranch = [null];
        this._addRecord(proto_record_1.RecordType.SkipRecordsIfNot, 'SkipRecordsIfNot', null, [], startOfFalseBranch, condition);
        var whenTrue = ast.trueExp.visit(this);
        var skip = this._addRecord(proto_record_1.RecordType.SkipRecords, 'SkipRecords', null, [], endOfFalseBranch, 0);
        var whenFalse = ast.falseExp.visit(this);
        startOfFalseBranch[0] = skip;
        endOfFalseBranch[0] = whenFalse;
        return this._addRecord(proto_record_1.RecordType.PrimitiveOp, 'cond', change_detection_util_1.ChangeDetectionUtil.cond, [condition, whenTrue, whenFalse], null, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitPipe = function (ast) {
        var value = ast.exp.visit(this);
        var args = this._visitAll(ast.args);
        return this._addRecord(proto_record_1.RecordType.Pipe, ast.name, ast.name, args, null, value);
    };
    _ConvertAstIntoProtoRecords.prototype.visitKeyedRead = function (ast) {
        var obj = ast.obj.visit(this);
        var key = ast.key.visit(this);
        return this._addRecord(proto_record_1.RecordType.KeyedRead, 'keyedAccess', change_detection_util_1.ChangeDetectionUtil.keyedAccess, [key], null, obj);
    };
    _ConvertAstIntoProtoRecords.prototype.visitChain = function (ast) {
        var _this = this;
        var args = ast.expressions.map(function (e) { return e.visit(_this); });
        return this._addRecord(proto_record_1.RecordType.Chain, 'chain', null, args, null, 0);
    };
    _ConvertAstIntoProtoRecords.prototype.visitQuote = function (ast) {
        throw new exceptions_1.BaseException(("Caught uninterpreted expression at " + ast.location + ": " + ast.uninterpretedExpression + ". ") +
            ("Expression prefix " + ast.prefix + " did not match a template transformer to interpret the expression."));
    };
    _ConvertAstIntoProtoRecords.prototype._visitAll = function (asts) {
        var res = collection_1.ListWrapper.createFixedSize(asts.length);
        for (var i = 0; i < asts.length; ++i) {
            res[i] = asts[i].visit(this);
        }
        return res;
    };
    /**
     * Adds a `ProtoRecord` and returns its selfIndex.
     */
    _ConvertAstIntoProtoRecords.prototype._addRecord = function (type, name, funcOrValue, args, fixedArgs, context) {
        var selfIndex = this._records.length + 1;
        if (context instanceof directive_record_1.DirectiveIndex) {
            this._records.push(new proto_record_1.ProtoRecord(type, name, funcOrValue, args, fixedArgs, -1, context, selfIndex, this._bindingRecord, false, false, false, false, this._bindingIndex));
        }
        else {
            this._records.push(new proto_record_1.ProtoRecord(type, name, funcOrValue, args, fixedArgs, context, null, selfIndex, this._bindingRecord, false, false, false, false, this._bindingIndex));
        }
        return selfIndex;
    };
    return _ConvertAstIntoProtoRecords;
})();
function _arrayFn(length) {
    switch (length) {
        case 0:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn0;
        case 1:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn1;
        case 2:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn2;
        case 3:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn3;
        case 4:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn4;
        case 5:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn5;
        case 6:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn6;
        case 7:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn7;
        case 8:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn8;
        case 9:
            return change_detection_util_1.ChangeDetectionUtil.arrayFn9;
        default:
            throw new exceptions_1.BaseException("Does not support literal maps with more than 9 elements");
    }
}
function _mapPrimitiveName(keys) {
    var stringifiedKeys = keys.map(function (k) { return lang_1.isString(k) ? "\"" + k + "\"" : "" + k; }).join(', ');
    return "mapFn([" + stringifiedKeys + "])";
}
function _operationToPrimitiveName(operation) {
    switch (operation) {
        case '+':
            return 'operation_add';
        case '-':
            return 'operation_subtract';
        case '*':
            return 'operation_multiply';
        case '/':
            return 'operation_divide';
        case '%':
            return 'operation_remainder';
        case '==':
            return 'operation_equals';
        case '!=':
            return 'operation_not_equals';
        case '===':
            return 'operation_identical';
        case '!==':
            return 'operation_not_identical';
        case '<':
            return 'operation_less_then';
        case '>':
            return 'operation_greater_then';
        case '<=':
            return 'operation_less_or_equals_then';
        case '>=':
            return 'operation_greater_or_equals_then';
        default:
            throw new exceptions_1.BaseException("Unsupported operation " + operation);
    }
}
function _operationToFunction(operation) {
    switch (operation) {
        case '+':
            return change_detection_util_1.ChangeDetectionUtil.operation_add;
        case '-':
            return change_detection_util_1.ChangeDetectionUtil.operation_subtract;
        case '*':
            return change_detection_util_1.ChangeDetectionUtil.operation_multiply;
        case '/':
            return change_detection_util_1.ChangeDetectionUtil.operation_divide;
        case '%':
            return change_detection_util_1.ChangeDetectionUtil.operation_remainder;
        case '==':
            return change_detection_util_1.ChangeDetectionUtil.operation_equals;
        case '!=':
            return change_detection_util_1.ChangeDetectionUtil.operation_not_equals;
        case '===':
            return change_detection_util_1.ChangeDetectionUtil.operation_identical;
        case '!==':
            return change_detection_util_1.ChangeDetectionUtil.operation_not_identical;
        case '<':
            return change_detection_util_1.ChangeDetectionUtil.operation_less_then;
        case '>':
            return change_detection_util_1.ChangeDetectionUtil.operation_greater_then;
        case '<=':
            return change_detection_util_1.ChangeDetectionUtil.operation_less_or_equals_then;
        case '>=':
            return change_detection_util_1.ChangeDetectionUtil.operation_greater_or_equals_then;
        default:
            throw new exceptions_1.BaseException("Unsupported operation " + operation);
    }
}
function s(v) {
    return lang_1.isPresent(v) ? "" + v : '';
}
function _interpolationFn(strings) {
    var length = strings.length;
    var c0 = length > 0 ? strings[0] : null;
    var c1 = length > 1 ? strings[1] : null;
    var c2 = length > 2 ? strings[2] : null;
    var c3 = length > 3 ? strings[3] : null;
    var c4 = length > 4 ? strings[4] : null;
    var c5 = length > 5 ? strings[5] : null;
    var c6 = length > 6 ? strings[6] : null;
    var c7 = length > 7 ? strings[7] : null;
    var c8 = length > 8 ? strings[8] : null;
    var c9 = length > 9 ? strings[9] : null;
    switch (length - 1) {
        case 1:
            return function (a1) { return c0 + s(a1) + c1; };
        case 2:
            return function (a1, a2) { return c0 + s(a1) + c1 + s(a2) + c2; };
        case 3:
            return function (a1, a2, a3) { return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3; };
        case 4:
            return function (a1, a2, a3, a4) { return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3 + s(a4) + c4; };
        case 5:
            return function (a1, a2, a3, a4, a5) {
                return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3 + s(a4) + c4 + s(a5) + c5;
            };
        case 6:
            return function (a1, a2, a3, a4, a5, a6) {
                return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3 + s(a4) + c4 + s(a5) + c5 + s(a6) + c6;
            };
        case 7:
            return function (a1, a2, a3, a4, a5, a6, a7) { return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3 + s(a4) +
                c4 + s(a5) + c5 + s(a6) + c6 + s(a7) + c7; };
        case 8:
            return function (a1, a2, a3, a4, a5, a6, a7, a8) { return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3 + s(a4) +
                c4 + s(a5) + c5 + s(a6) + c6 + s(a7) + c7 + s(a8) + c8; };
        case 9:
            return function (a1, a2, a3, a4, a5, a6, a7, a8, a9) { return c0 + s(a1) + c1 + s(a2) + c2 + s(a3) + c3 +
                s(a4) + c4 + s(a5) + c5 + s(a6) + c6 + s(a7) + c7 + s(a8) + c8 + s(a9) + c9; };
        default:
            throw new exceptions_1.BaseException("Does not support more than 9 expressions");
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdG9fY2hhbmdlX2RldGVjdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGlmZmluZ19wbHVnaW5fd3JhcHBlci1vdXRwdXRfcGF0aC1WM3YwVkpGSC50bXAvYW5ndWxhcjIvc3JjL2NvcmUvY2hhbmdlX2RldGVjdGlvbi9wcm90b19jaGFuZ2VfZGV0ZWN0b3IudHMiXSwibmFtZXMiOlsiRHluYW1pY1Byb3RvQ2hhbmdlRGV0ZWN0b3IiLCJEeW5hbWljUHJvdG9DaGFuZ2VEZXRlY3Rvci5jb25zdHJ1Y3RvciIsIkR5bmFtaWNQcm90b0NoYW5nZURldGVjdG9yLmluc3RhbnRpYXRlIiwiY3JlYXRlUHJvcGVydHlSZWNvcmRzIiwiY3JlYXRlRXZlbnRSZWNvcmRzIiwiUHJvdG9SZWNvcmRCdWlsZGVyIiwiUHJvdG9SZWNvcmRCdWlsZGVyLmNvbnN0cnVjdG9yIiwiUHJvdG9SZWNvcmRCdWlsZGVyLmFkZCIsIlByb3RvUmVjb3JkQnVpbGRlci5fc2V0QXJndW1lbnRUb1B1cmVGdW5jdGlvbiIsIlByb3RvUmVjb3JkQnVpbGRlci5fYXBwZW5kUmVjb3JkcyIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3JkcyIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy5jb25zdHJ1Y3RvciIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy5hcHBlbmQiLCJfQ29udmVydEFzdEludG9Qcm90b1JlY29yZHMuY3JlYXRlIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0SW1wbGljaXRSZWNlaXZlciIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdEludGVycG9sYXRpb24iLCJfQ29udmVydEFzdEludG9Qcm90b1JlY29yZHMudmlzaXRMaXRlcmFsUHJpbWl0aXZlIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0UHJvcGVydHlSZWFkIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0UHJvcGVydHlXcml0ZSIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdEtleWVkV3JpdGUiLCJfQ29udmVydEFzdEludG9Qcm90b1JlY29yZHMudmlzaXRTYWZlUHJvcGVydHlSZWFkIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0TWV0aG9kQ2FsbCIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdFNhZmVNZXRob2RDYWxsIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0RnVuY3Rpb25DYWxsIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0TGl0ZXJhbEFycmF5IiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0TGl0ZXJhbE1hcCIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdEJpbmFyeSIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdFByZWZpeE5vdCIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdENvbmRpdGlvbmFsIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0UGlwZSIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdEtleWVkUmVhZCIsIl9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy52aXNpdENoYWluIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLnZpc2l0UXVvdGUiLCJfQ29udmVydEFzdEludG9Qcm90b1JlY29yZHMuX3Zpc2l0QWxsIiwiX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLl9hZGRSZWNvcmQiLCJfYXJyYXlGbiIsIl9tYXBQcmltaXRpdmVOYW1lIiwiX29wZXJhdGlvblRvUHJpbWl0aXZlTmFtZSIsIl9vcGVyYXRpb25Ub0Z1bmN0aW9uIiwicyIsIl9pbnRlcnBvbGF0aW9uRm4iXSwibWFwcGluZ3MiOiJBQUFBLHFCQUFpRCwwQkFBMEIsQ0FBQyxDQUFBO0FBQzVFLDJCQUE0QixnQ0FBZ0MsQ0FBQyxD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QSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU5RkEsS0FBS0EsSUFBSUE7Z0JBQ1BBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EseUJBQVVBLENBQUNBLGFBQWFBLEVBQUVBLGVBQWVBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO2dCQUN0RkEsSUFBSUEsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtnQkFDckJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQ2xCQSx5QkFBVUEsQ0FBQ0EsV0FBV0EsRUFBRUEsTUFBTUEsRUFBRUEsMkNBQW1CQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU5RkE7Z0JBQ0VBLElBQUlBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNsQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FDbEJBLHlCQUFVQSxDQUFDQSxXQUFXQSxFQUFFQSx5QkFBeUJBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLEVBQ2hFQSxvQkFBb0JBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JFQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVEaEIsb0RBQWNBLEdBQWRBLFVBQWVBLEdBQWNBO1FBQzNCaUIsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQ2xCQSx5QkFBVUEsQ0FBQ0EsV0FBV0EsRUFBRUEsa0JBQWtCQSxFQUFFQSwyQ0FBbUJBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFDdkZBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ2ZBLENBQUNBO0lBRURqQixzREFBZ0JBLEdBQWhCQSxVQUFpQkEsR0FBZ0JBO1FBQy9Ca0IsSUFBSUEsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDMUNBLElBQUlBLGtCQUFrQkEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDaENBLElBQUlBLGdCQUFnQkEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLFVBQVVBLENBQ1hBLHlCQUFVQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLGtCQUFrQkEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsRUFBRUEsa0JBQWtCQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM5RkEsSUFBSUEsUUFBUUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLElBQUlBLElBQUlBLEdBQ0pBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLHlCQUFVQSxDQUFDQSxXQUFXQSxFQUFFQSxhQUFhQSxFQUFFQSxJQUFJQSxFQUFFQSxFQUFFQSxFQUFFQSxnQkFBZ0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzFGQSxJQUFJQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN6Q0Esa0JBQWtCQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUM3QkEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUVoQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FDbEJBLHlCQUFVQSxDQUFDQSxXQUFXQSxFQUFFQSxNQUFNQSxFQUFFQSwyQ0FBbUJBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLFNBQVNBLEVBQUVBLFFBQVFBLEVBQUVBLFNBQVNBLENBQUNBLEVBQzFGQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNmQSxDQUFDQTtJQUVEbEIsK0NBQVNBLEdBQVRBLFVBQVVBLEdBQWdCQTtRQUN4Qm1CLElBQUlBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2hDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EseUJBQVVBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO0lBQ2pGQSxDQUFDQTtJQUVEbkIsb0RBQWNBLEdBQWRBLFVBQWVBLEdBQWNBO1FBQzNCb0IsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLElBQUlBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUNsQkEseUJBQVVBLENBQUNBLFNBQVNBLEVBQUVBLGFBQWFBLEVBQUVBLDJDQUFtQkEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDOUZBLENBQUNBO0lBRURwQixnREFBVUEsR0FBVkEsVUFBV0EsR0FBVUE7UUFBckJxQixpQkFHQ0E7UUFGQ0EsSUFBSUEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBQUEsQ0FBQ0EsSUFBSUEsT0FBQUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBSUEsQ0FBQ0EsRUFBYkEsQ0FBYUEsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLHlCQUFVQSxDQUFDQSxLQUFLQSxFQUFFQSxPQUFPQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN6RUEsQ0FBQ0E7SUFFRHJCLGdEQUFVQSxHQUFWQSxVQUFXQSxHQUFVQTtRQUNuQnNCLE1BQU1BLElBQUlBLDBCQUFhQSxDQUNuQkEseUNBQXNDQSxHQUFHQSxDQUFDQSxRQUFRQSxVQUFLQSxHQUFHQSxDQUFDQSx1QkFBdUJBLFFBQUlBO1lBQ3RGQSx3QkFBcUJBLEdBQUdBLENBQUNBLE1BQU1BLHdFQUFvRUEsQ0FBQ0EsQ0FBQ0E7SUFDM0dBLENBQUNBO0lBRU90QiwrQ0FBU0EsR0FBakJBLFVBQWtCQSxJQUFXQTtRQUMzQnVCLElBQUlBLEdBQUdBLEdBQUdBLHdCQUFXQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNuREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDckNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNiQSxDQUFDQTtJQUVEdkI7O09BRUdBO0lBQ0tBLGdEQUFVQSxHQUFsQkEsVUFBbUJBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLE9BQU9BO1FBQ2xFd0IsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDekNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLFlBQVlBLGlDQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsMEJBQVdBLENBQzlCQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxXQUFXQSxFQUFFQSxJQUFJQSxFQUFFQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxPQUFPQSxFQUFFQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUNyRkEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ05BLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLDBCQUFXQSxDQUM5QkEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsV0FBV0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsT0FBT0EsRUFBRUEsSUFBSUEsRUFBRUEsU0FBU0EsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFDdkZBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZEQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFDSHhCLGtDQUFDQTtBQUFEQSxDQUFDQSxBQXhNRCxJQXdNQztBQUdELGtCQUFrQixNQUFjO0lBQzlCeUIsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN0Q0E7WUFDRUEsTUFBTUEsSUFBSUEsMEJBQWFBLENBQUNBLHlEQUF5REEsQ0FBQ0EsQ0FBQ0E7SUFDdkZBLENBQUNBO0FBQ0hBLENBQUNBO0FBRUQsMkJBQTJCLElBQVc7SUFDcENDLElBQUlBLGVBQWVBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFVBQUFBLENBQUNBLElBQUlBLE9BQUFBLGVBQVFBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE9BQUlBLENBQUNBLE9BQUdBLEdBQUdBLEtBQUdBLENBQUdBLEVBQS9CQSxDQUErQkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDaEZBLE1BQU1BLENBQUNBLFlBQVVBLGVBQWVBLE9BQUlBLENBQUNBO0FBQ3ZDQSxDQUFDQTtBQUVELG1DQUFtQyxTQUFpQjtJQUNsREMsTUFBTUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLEtBQUtBLEdBQUdBO1lBQ05BLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBO1FBQ3pCQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSxvQkFBb0JBLENBQUNBO1FBQzlCQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSxvQkFBb0JBLENBQUNBO1FBQzlCQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSxrQkFBa0JBLENBQUNBO1FBQzVCQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSxxQkFBcUJBLENBQUNBO1FBQy9CQSxLQUFLQSxJQUFJQTtZQUNQQSxNQUFNQSxDQUFDQSxrQkFBa0JBLENBQUNBO1FBQzVCQSxLQUFLQSxJQUFJQTtZQUNQQSxNQUFNQSxDQUFDQSxzQkFBc0JBLENBQUNBO1FBQ2hDQSxLQUFLQSxLQUFLQTtZQUNSQSxNQUFNQSxDQUFDQSxxQkFBcUJBLENBQUNBO1FBQy9CQSxLQUFLQSxLQUFLQTtZQUNSQSxNQUFNQSxDQUFDQSx5QkFBeUJBLENBQUNBO1FBQ25DQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSxxQkFBcUJBLENBQUNBO1FBQy9CQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSx3QkFBd0JBLENBQUNBO1FBQ2xDQSxLQUFLQSxJQUFJQTtZQUNQQSxNQUFNQSxDQUFDQSwrQkFBK0JBLENBQUNBO1FBQ3pDQSxLQUFLQSxJQUFJQTtZQUNQQSxNQUFNQSxDQUFDQSxrQ0FBa0NBLENBQUNBO1FBQzVDQTtZQUNFQSxNQUFNQSxJQUFJQSwwQkFBYUEsQ0FBQ0EsMkJBQXlCQSxTQUFXQSxDQUFDQSxDQUFDQTtJQUNsRUEsQ0FBQ0E7QUFDSEEsQ0FBQ0E7QUFFRCw4QkFBOEIsU0FBaUI7SUFDN0NDLE1BQU1BLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xCQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSwyQ0FBbUJBLENBQUNBLGFBQWFBLENBQUNBO1FBQzNDQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSwyQ0FBbUJBLENBQUNBLGtCQUFrQkEsQ0FBQ0E7UUFDaERBLEtBQUtBLEdBQUdBO1lBQ05BLE1BQU1BLENBQUNBLDJDQUFtQkEsQ0FBQ0Esa0JBQWtCQSxDQUFDQTtRQUNoREEsS0FBS0EsR0FBR0E7WUFDTkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxnQkFBZ0JBLENBQUNBO1FBQzlDQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSwyQ0FBbUJBLENBQUNBLG1CQUFtQkEsQ0FBQ0E7UUFDakRBLEtBQUtBLElBQUlBO1lBQ1BBLE1BQU1BLENBQUNBLDJDQUFtQkEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTtRQUM5Q0EsS0FBS0EsSUFBSUE7WUFDUEEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxvQkFBb0JBLENBQUNBO1FBQ2xEQSxLQUFLQSxLQUFLQTtZQUNSQSxNQUFNQSxDQUFDQSwyQ0FBbUJBLENBQUNBLG1CQUFtQkEsQ0FBQ0E7UUFDakRBLEtBQUtBLEtBQUtBO1lBQ1JBLE1BQU1BLENBQUNBLDJDQUFtQkEsQ0FBQ0EsdUJBQXVCQSxDQUFDQTtRQUNyREEsS0FBS0EsR0FBR0E7WUFDTkEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxtQkFBbUJBLENBQUNBO1FBQ2pEQSxLQUFLQSxHQUFHQTtZQUNOQSxNQUFNQSxDQUFDQSwyQ0FBbUJBLENBQUNBLHNCQUFzQkEsQ0FBQ0E7UUFDcERBLEtBQUtBLElBQUlBO1lBQ1BBLE1BQU1BLENBQUNBLDJDQUFtQkEsQ0FBQ0EsNkJBQTZCQSxDQUFDQTtRQUMzREEsS0FBS0EsSUFBSUE7WUFDUEEsTUFBTUEsQ0FBQ0EsMkNBQW1CQSxDQUFDQSxnQ0FBZ0NBLENBQUNBO1FBQzlEQTtZQUNFQSxNQUFNQSxJQUFJQSwwQkFBYUEsQ0FBQ0EsMkJBQXlCQSxTQUFXQSxDQUFDQSxDQUFDQTtJQUNsRUEsQ0FBQ0E7QUFDSEEsQ0FBQ0E7QUFFRCxXQUFXLENBQUM7SUFDVkMsTUFBTUEsQ0FBQ0EsZ0JBQVNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEtBQUdBLENBQUdBLEdBQUdBLEVBQUVBLENBQUNBO0FBQ3BDQSxDQUFDQTtBQUVELDBCQUEwQixPQUFjO0lBQ3RDQyxJQUFJQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQTtJQUM1QkEsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDeENBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3hDQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN4Q0EsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDeENBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3hDQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN4Q0EsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDeENBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3hDQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN4Q0EsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDeENBLE1BQU1BLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ25CQSxLQUFLQSxDQUFDQTtZQUNKQSxNQUFNQSxDQUFDQSxVQUFDQSxFQUFFQSxJQUFLQSxPQUFBQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFmQSxDQUFlQSxDQUFDQTtRQUNqQ0EsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsSUFBS0EsT0FBQUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBNUJBLENBQTRCQSxDQUFDQTtRQUNsREEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBS0EsT0FBQUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBekNBLENBQXlDQSxDQUFDQTtRQUNuRUEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBS0EsT0FBQUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBdERBLENBQXNEQSxDQUFDQTtRQUNwRkEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUE7dUJBQ2ZBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBO1lBQW5FQSxDQUFtRUEsQ0FBQ0E7UUFDakZBLEtBQUtBLENBQUNBO1lBQ0pBLE1BQU1BLENBQUNBLFVBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBO3VCQUNuQkEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUE7WUFBaEZBLENBQWdGQSxDQUFDQTtRQUM5RkEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBS0EsT0FBQUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ3BGQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUROQSxDQUNNQSxDQUFDQTtRQUNoREEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBS0EsT0FBQUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ3hGQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxFQURmQSxDQUNlQSxDQUFDQTtRQUM3REEsS0FBS0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsVUFBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBS0EsT0FBQUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUE7Z0JBQ3BGQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxFQURoQ0EsQ0FDZ0NBLENBQUNBO1FBQ2xGQTtZQUNFQSxNQUFNQSxJQUFJQSwwQkFBYUEsQ0FBQ0EsMENBQTBDQSxDQUFDQSxDQUFDQTtJQUN4RUEsQ0FBQ0E7QUFDSEEsQ0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1R5cGUsIGlzQmxhbmssIGlzUHJlc2VudCwgaXNTdHJpbmd9IGZyb20gJ2FuZ3VsYXIyL3NyYy9mYWNhZGUvbGFuZyc7XG5pbXBvcnQge0Jhc2VFeGNlcHRpb259IGZyb20gJ2FuZ3VsYXIyL3NyYy9mYWNhZGUvZXhjZXB0aW9ucyc7XG5pbXBvcnQge0xpc3RXcmFwcGVyLCBNYXBXcmFwcGVyLCBTdHJpbmdNYXBXcmFwcGVyfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2NvbGxlY3Rpb24nO1xuXG5pbXBvcnQge1Byb3BlcnR5UmVhZCwgUHJvcGVydHlXcml0ZSwgS2V5ZWRXcml0ZSwgQVNULCBBU1RXaXRoU291cmNlLCBBc3RWaXNpdG9yLCBCaW5hcnksIENoYWluLCBDb25kaXRpb25hbCwgQmluZGluZ1BpcGUsIEZ1bmN0aW9uQ2FsbCwgSW1wbGljaXRSZWNlaXZlciwgSW50ZXJwb2xhdGlvbiwgS2V5ZWRSZWFkLCBMaXRlcmFsQXJyYXksIExpdGVyYWxNYXAsIExpdGVyYWxQcmltaXRpdmUsIE1ldGhvZENhbGwsIFByZWZpeE5vdCwgUXVvdGUsIFNhZmVQcm9wZXJ0eVJlYWQsIFNhZmVNZXRob2RDYWxsfSBmcm9tICcuL3BhcnNlci9hc3QnO1xuXG5pbXBvcnQge0NoYW5nZURldGVjdG9yLCBQcm90b0NoYW5nZURldGVjdG9yLCBDaGFuZ2VEZXRlY3RvckRlZmluaXRpb259IGZyb20gJy4vaW50ZXJmYWNlcyc7XG5pbXBvcnQge0NoYW5nZURldGVjdGlvblV0aWx9IGZyb20gJy4vY2hhbmdlX2RldGVjdGlvbl91dGlsJztcbmltcG9ydCB7RHluYW1pY0NoYW5nZURldGVjdG9yfSBmcm9tICcuL2R5bmFtaWNfY2hhbmdlX2RldGVjdG9yJztcbmltcG9ydCB7QmluZGluZ1JlY29yZCwgQmluZGluZ1RhcmdldH0gZnJvbSAnLi9iaW5kaW5nX3JlY29yZCc7XG5pbXBvcnQge0RpcmVjdGl2ZVJlY29yZCwgRGlyZWN0aXZlSW5kZXh9IGZyb20gJy4vZGlyZWN0aXZlX3JlY29yZCc7XG5pbXBvcnQge0V2ZW50QmluZGluZ30gZnJvbSAnLi9ldmVudF9iaW5kaW5nJztcblxuaW1wb3J0IHtjb2FsZXNjZX0gZnJvbSAnLi9jb2FsZXNjZSc7XG5pbXBvcnQge1Byb3RvUmVjb3JkLCBSZWNvcmRUeXBlfSBmcm9tICcuL3Byb3RvX3JlY29yZCc7XG5cbmV4cG9ydCBjbGFzcyBEeW5hbWljUHJvdG9DaGFuZ2VEZXRlY3RvciBpbXBsZW1lbnRzIFByb3RvQ2hhbmdlRGV0ZWN0b3Ige1xuICAvKiogQGludGVybmFsICovXG4gIF9wcm9wZXJ0eUJpbmRpbmdSZWNvcmRzOiBQcm90b1JlY29yZFtdO1xuICAvKiogQGludGVybmFsICovXG4gIF9wcm9wZXJ0eUJpbmRpbmdUYXJnZXRzOiBCaW5kaW5nVGFyZ2V0W107XG4gIC8qKiBAaW50ZXJuYWwgKi9cbiAgX2V2ZW50QmluZGluZ1JlY29yZHM6IEV2ZW50QmluZGluZ1tdO1xuICAvKiogQGludGVybmFsICovXG4gIF9kaXJlY3RpdmVJbmRpY2VzOiBEaXJlY3RpdmVJbmRleFtdO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgX2RlZmluaXRpb246IENoYW5nZURldGVjdG9yRGVmaW5pdGlvbikge1xuICAgIHRoaXMuX3Byb3BlcnR5QmluZGluZ1JlY29yZHMgPSBjcmVhdGVQcm9wZXJ0eVJlY29yZHMoX2RlZmluaXRpb24pO1xuICAgIHRoaXMuX2V2ZW50QmluZGluZ1JlY29yZHMgPSBjcmVhdGVFdmVudFJlY29yZHMoX2RlZmluaXRpb24pO1xuICAgIHRoaXMuX3Byb3BlcnR5QmluZGluZ1RhcmdldHMgPSB0aGlzLl9kZWZpbml0aW9uLmJpbmRpbmdSZWNvcmRzLm1hcChiID0+IGIudGFyZ2V0KTtcbiAgICB0aGlzLl9kaXJlY3RpdmVJbmRpY2VzID0gdGhpcy5fZGVmaW5pdGlvbi5kaXJlY3RpdmVSZWNvcmRzLm1hcChkID0+IGQuZGlyZWN0aXZlSW5kZXgpO1xuICB9XG5cbiAgaW5zdGFudGlhdGUoKTogQ2hhbmdlRGV0ZWN0b3Ige1xuICAgIHJldHVybiBuZXcgRHluYW1pY0NoYW5nZURldGVjdG9yKFxuICAgICAgICB0aGlzLl9kZWZpbml0aW9uLmlkLCB0aGlzLl9wcm9wZXJ0eUJpbmRpbmdSZWNvcmRzLmxlbmd0aCwgdGhpcy5fcHJvcGVydHlCaW5kaW5nVGFyZ2V0cyxcbiAgICAgICAgdGhpcy5fZGlyZWN0aXZlSW5kaWNlcywgdGhpcy5fZGVmaW5pdGlvbi5zdHJhdGVneSwgdGhpcy5fcHJvcGVydHlCaW5kaW5nUmVjb3JkcyxcbiAgICAgICAgdGhpcy5fZXZlbnRCaW5kaW5nUmVjb3JkcywgdGhpcy5fZGVmaW5pdGlvbi5kaXJlY3RpdmVSZWNvcmRzLCB0aGlzLl9kZWZpbml0aW9uLmdlbkNvbmZpZyk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVByb3BlcnR5UmVjb3JkcyhkZWZpbml0aW9uOiBDaGFuZ2VEZXRlY3RvckRlZmluaXRpb24pOiBQcm90b1JlY29yZFtdIHtcbiAgdmFyIHJlY29yZEJ1aWxkZXIgPSBuZXcgUHJvdG9SZWNvcmRCdWlsZGVyKCk7XG4gIExpc3RXcmFwcGVyLmZvckVhY2hXaXRoSW5kZXgoXG4gICAgICBkZWZpbml0aW9uLmJpbmRpbmdSZWNvcmRzLFxuICAgICAgKGI6IEJpbmRpbmdSZWNvcmQsIGluZGV4OiBudW1iZXIpID0+IHJlY29yZEJ1aWxkZXIuYWRkKGIsIGRlZmluaXRpb24udmFyaWFibGVOYW1lcywgaW5kZXgpKTtcbiAgcmV0dXJuIGNvYWxlc2NlKHJlY29yZEJ1aWxkZXIucmVjb3Jkcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFdmVudFJlY29yZHMoZGVmaW5pdGlvbjogQ2hhbmdlRGV0ZWN0b3JEZWZpbml0aW9uKTogRXZlbnRCaW5kaW5nW10ge1xuICAvLyBUT0RPOiB2c2F2a2luOiByZW1vdmUgJGV2ZW50IHdoZW4gdGhlIGNvbXBpbGVyIGhhbmRsZXMgcmVuZGVyLXNpZGUgdmFyaWFibGVzIHByb3Blcmx5XG4gIHZhciB2YXJOYW1lcyA9IExpc3RXcmFwcGVyLmNvbmNhdChbJyRldmVudCddLCBkZWZpbml0aW9uLnZhcmlhYmxlTmFtZXMpO1xuICByZXR1cm4gZGVmaW5pdGlvbi5ldmVudFJlY29yZHMubWFwKGVyID0+IHtcbiAgICB2YXIgcmVjb3JkcyA9IF9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy5jcmVhdGUoZXIsIHZhck5hbWVzKTtcbiAgICB2YXIgZGlySW5kZXggPSBlci5pbXBsaWNpdFJlY2VpdmVyIGluc3RhbmNlb2YgRGlyZWN0aXZlSW5kZXggPyBlci5pbXBsaWNpdFJlY2VpdmVyIDogbnVsbDtcbiAgICByZXR1cm4gbmV3IEV2ZW50QmluZGluZyhlci50YXJnZXQubmFtZSwgZXIudGFyZ2V0LmVsZW1lbnRJbmRleCwgZGlySW5kZXgsIHJlY29yZHMpO1xuICB9KTtcbn1cblxuZXhwb3J0IGNsYXNzIFByb3RvUmVjb3JkQnVpbGRlciB7XG4gIHJlY29yZHM6IFByb3RvUmVjb3JkW10gPSBbXTtcblxuICBhZGQoYjogQmluZGluZ1JlY29yZCwgdmFyaWFibGVOYW1lczogc3RyaW5nW10sIGJpbmRpbmdJbmRleDogbnVtYmVyKSB7XG4gICAgdmFyIG9sZExhc3QgPSBMaXN0V3JhcHBlci5sYXN0KHRoaXMucmVjb3Jkcyk7XG4gICAgaWYgKGlzUHJlc2VudChvbGRMYXN0KSAmJiBvbGRMYXN0LmJpbmRpbmdSZWNvcmQuZGlyZWN0aXZlUmVjb3JkID09IGIuZGlyZWN0aXZlUmVjb3JkKSB7XG4gICAgICBvbGRMYXN0Lmxhc3RJbkRpcmVjdGl2ZSA9IGZhbHNlO1xuICAgIH1cbiAgICB2YXIgbnVtYmVyT2ZSZWNvcmRzQmVmb3JlID0gdGhpcy5yZWNvcmRzLmxlbmd0aDtcbiAgICB0aGlzLl9hcHBlbmRSZWNvcmRzKGIsIHZhcmlhYmxlTmFtZXMsIGJpbmRpbmdJbmRleCk7XG4gICAgdmFyIG5ld0xhc3QgPSBMaXN0V3JhcHBlci5sYXN0KHRoaXMucmVjb3Jkcyk7XG4gICAgaWYgKGlzUHJlc2VudChuZXdMYXN0KSAmJiBuZXdMYXN0ICE9PSBvbGRMYXN0KSB7XG4gICAgICBuZXdMYXN0Lmxhc3RJbkJpbmRpbmcgPSB0cnVlO1xuICAgICAgbmV3TGFzdC5sYXN0SW5EaXJlY3RpdmUgPSB0cnVlO1xuICAgICAgdGhpcy5fc2V0QXJndW1lbnRUb1B1cmVGdW5jdGlvbihudW1iZXJPZlJlY29yZHNCZWZvcmUpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgKi9cbiAgX3NldEFyZ3VtZW50VG9QdXJlRnVuY3Rpb24oc3RhcnRJbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0SW5kZXg7IGkgPCB0aGlzLnJlY29yZHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciByZWMgPSB0aGlzLnJlY29yZHNbaV07XG4gICAgICBpZiAocmVjLmlzUHVyZUZ1bmN0aW9uKCkpIHtcbiAgICAgICAgcmVjLmFyZ3MuZm9yRWFjaChcbiAgICAgICAgICAgIHJlY29yZEluZGV4ID0+IHRoaXMucmVjb3Jkc1tyZWNvcmRJbmRleCAtIDFdLmFyZ3VtZW50VG9QdXJlRnVuY3Rpb24gPSB0cnVlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZWMubW9kZSA9PT0gUmVjb3JkVHlwZS5QaXBlKSB7XG4gICAgICAgIHJlYy5hcmdzLmZvckVhY2goXG4gICAgICAgICAgICByZWNvcmRJbmRleCA9PiB0aGlzLnJlY29yZHNbcmVjb3JkSW5kZXggLSAxXS5hcmd1bWVudFRvUHVyZUZ1bmN0aW9uID0gdHJ1ZSk7XG4gICAgICAgIHRoaXMucmVjb3Jkc1tyZWMuY29udGV4dEluZGV4IC0gMV0uYXJndW1lbnRUb1B1cmVGdW5jdGlvbiA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCAqL1xuICBfYXBwZW5kUmVjb3JkcyhiOiBCaW5kaW5nUmVjb3JkLCB2YXJpYWJsZU5hbWVzOiBzdHJpbmdbXSwgYmluZGluZ0luZGV4OiBudW1iZXIpIHtcbiAgICBpZiAoYi5pc0RpcmVjdGl2ZUxpZmVjeWNsZSgpKSB7XG4gICAgICB0aGlzLnJlY29yZHMucHVzaChuZXcgUHJvdG9SZWNvcmQoXG4gICAgICAgICAgUmVjb3JkVHlwZS5EaXJlY3RpdmVMaWZlY3ljbGUsIGIubGlmZWN5Y2xlRXZlbnQsIG51bGwsIFtdLCBbXSwgLTEsIG51bGwsXG4gICAgICAgICAgdGhpcy5yZWNvcmRzLmxlbmd0aCArIDEsIGIsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBudWxsKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIF9Db252ZXJ0QXN0SW50b1Byb3RvUmVjb3Jkcy5hcHBlbmQodGhpcy5yZWNvcmRzLCBiLCB2YXJpYWJsZU5hbWVzLCBiaW5kaW5nSW5kZXgpO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBfQ29udmVydEFzdEludG9Qcm90b1JlY29yZHMgaW1wbGVtZW50cyBBc3RWaXNpdG9yIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwcml2YXRlIF9yZWNvcmRzOiBQcm90b1JlY29yZFtdLCBwcml2YXRlIF9iaW5kaW5nUmVjb3JkOiBCaW5kaW5nUmVjb3JkLFxuICAgICAgcHJpdmF0ZSBfdmFyaWFibGVOYW1lczogc3RyaW5nW10sIHByaXZhdGUgX2JpbmRpbmdJbmRleDogbnVtYmVyKSB7fVxuXG4gIHN0YXRpYyBhcHBlbmQoXG4gICAgICByZWNvcmRzOiBQcm90b1JlY29yZFtdLCBiOiBCaW5kaW5nUmVjb3JkLCB2YXJpYWJsZU5hbWVzOiBzdHJpbmdbXSwgYmluZGluZ0luZGV4OiBudW1iZXIpIHtcbiAgICB2YXIgYyA9IG5ldyBfQ29udmVydEFzdEludG9Qcm90b1JlY29yZHMocmVjb3JkcywgYiwgdmFyaWFibGVOYW1lcywgYmluZGluZ0luZGV4KTtcbiAgICBiLmFzdC52aXNpdChjKTtcbiAgfVxuXG4gIHN0YXRpYyBjcmVhdGUoYjogQmluZGluZ1JlY29yZCwgdmFyaWFibGVOYW1lczogYW55W10pOiBQcm90b1JlY29yZFtdIHtcbiAgICB2YXIgcmVjID0gW107XG4gICAgX0NvbnZlcnRBc3RJbnRvUHJvdG9SZWNvcmRzLmFwcGVuZChyZWMsIGIsIHZhcmlhYmxlTmFtZXMsIG51bGwpO1xuICAgIHJlY1tyZWMubGVuZ3RoIC0gMV0ubGFzdEluQmluZGluZyA9IHRydWU7XG4gICAgcmV0dXJuIHJlYztcbiAgfVxuXG4gIHZpc2l0SW1wbGljaXRSZWNlaXZlcihhc3Q6IEltcGxpY2l0UmVjZWl2ZXIpOiBhbnkgeyByZXR1cm4gdGhpcy5fYmluZGluZ1JlY29yZC5pbXBsaWNpdFJlY2VpdmVyOyB9XG5cbiAgdmlzaXRJbnRlcnBvbGF0aW9uKGFzdDogSW50ZXJwb2xhdGlvbik6IG51bWJlciB7XG4gICAgdmFyIGFyZ3MgPSB0aGlzLl92aXNpdEFsbChhc3QuZXhwcmVzc2lvbnMpO1xuICAgIHJldHVybiB0aGlzLl9hZGRSZWNvcmQoXG4gICAgICAgIFJlY29yZFR5cGUuSW50ZXJwb2xhdGUsICdpbnRlcnBvbGF0ZScsIF9pbnRlcnBvbGF0aW9uRm4oYXN0LnN0cmluZ3MpLCBhcmdzLCBhc3Quc3RyaW5ncywgMCk7XG4gIH1cblxuICB2aXNpdExpdGVyYWxQcmltaXRpdmUoYXN0OiBMaXRlcmFsUHJpbWl0aXZlKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuQ29uc3QsICdsaXRlcmFsJywgYXN0LnZhbHVlLCBbXSwgbnVsbCwgMCk7XG4gIH1cblxuICB2aXNpdFByb3BlcnR5UmVhZChhc3Q6IFByb3BlcnR5UmVhZCk6IG51bWJlciB7XG4gICAgdmFyIHJlY2VpdmVyID0gYXN0LnJlY2VpdmVyLnZpc2l0KHRoaXMpO1xuICAgIGlmIChpc1ByZXNlbnQodGhpcy5fdmFyaWFibGVOYW1lcykgJiYgTGlzdFdyYXBwZXIuY29udGFpbnModGhpcy5fdmFyaWFibGVOYW1lcywgYXN0Lm5hbWUpICYmXG4gICAgICAgIGFzdC5yZWNlaXZlciBpbnN0YW5jZW9mIEltcGxpY2l0UmVjZWl2ZXIpIHtcbiAgICAgIHJldHVybiB0aGlzLl9hZGRSZWNvcmQoUmVjb3JkVHlwZS5Mb2NhbCwgYXN0Lm5hbWUsIGFzdC5uYW1lLCBbXSwgbnVsbCwgcmVjZWl2ZXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuUHJvcGVydHlSZWFkLCBhc3QubmFtZSwgYXN0LmdldHRlciwgW10sIG51bGwsIHJlY2VpdmVyKTtcbiAgICB9XG4gIH1cblxuICB2aXNpdFByb3BlcnR5V3JpdGUoYXN0OiBQcm9wZXJ0eVdyaXRlKTogbnVtYmVyIHtcbiAgICBpZiAoaXNQcmVzZW50KHRoaXMuX3ZhcmlhYmxlTmFtZXMpICYmIExpc3RXcmFwcGVyLmNvbnRhaW5zKHRoaXMuX3ZhcmlhYmxlTmFtZXMsIGFzdC5uYW1lKSAmJlxuICAgICAgICBhc3QucmVjZWl2ZXIgaW5zdGFuY2VvZiBJbXBsaWNpdFJlY2VpdmVyKSB7XG4gICAgICB0aHJvdyBuZXcgQmFzZUV4Y2VwdGlvbihgQ2Fubm90IHJlYXNzaWduIGEgdmFyaWFibGUgYmluZGluZyAke2FzdC5uYW1lfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVjZWl2ZXIgPSBhc3QucmVjZWl2ZXIudmlzaXQodGhpcyk7XG4gICAgICB2YXIgdmFsdWUgPSBhc3QudmFsdWUudmlzaXQodGhpcyk7XG4gICAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFxuICAgICAgICAgIFJlY29yZFR5cGUuUHJvcGVydHlXcml0ZSwgYXN0Lm5hbWUsIGFzdC5zZXR0ZXIsIFt2YWx1ZV0sIG51bGwsIHJlY2VpdmVyKTtcbiAgICB9XG4gIH1cblxuICB2aXNpdEtleWVkV3JpdGUoYXN0OiBLZXllZFdyaXRlKTogbnVtYmVyIHtcbiAgICB2YXIgb2JqID0gYXN0Lm9iai52aXNpdCh0aGlzKTtcbiAgICB2YXIga2V5ID0gYXN0LmtleS52aXNpdCh0aGlzKTtcbiAgICB2YXIgdmFsdWUgPSBhc3QudmFsdWUudmlzaXQodGhpcyk7XG4gICAgcmV0dXJuIHRoaXMuX2FkZFJlY29yZChSZWNvcmRUeXBlLktleWVkV3JpdGUsIG51bGwsIG51bGwsIFtrZXksIHZhbHVlXSwgbnVsbCwgb2JqKTtcbiAgfVxuXG4gIHZpc2l0U2FmZVByb3BlcnR5UmVhZChhc3Q6IFNhZmVQcm9wZXJ0eVJlYWQpOiBudW1iZXIge1xuICAgIHZhciByZWNlaXZlciA9IGFzdC5yZWNlaXZlci52aXNpdCh0aGlzKTtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuU2FmZVByb3BlcnR5LCBhc3QubmFtZSwgYXN0LmdldHRlciwgW10sIG51bGwsIHJlY2VpdmVyKTtcbiAgfVxuXG4gIHZpc2l0TWV0aG9kQ2FsbChhc3Q6IE1ldGhvZENhbGwpOiBudW1iZXIge1xuICAgIHZhciByZWNlaXZlciA9IGFzdC5yZWNlaXZlci52aXNpdCh0aGlzKTtcbiAgICB2YXIgYXJncyA9IHRoaXMuX3Zpc2l0QWxsKGFzdC5hcmdzKTtcbiAgICBpZiAoaXNQcmVzZW50KHRoaXMuX3ZhcmlhYmxlTmFtZXMpICYmIExpc3RXcmFwcGVyLmNvbnRhaW5zKHRoaXMuX3ZhcmlhYmxlTmFtZXMsIGFzdC5uYW1lKSkge1xuICAgICAgdmFyIHRhcmdldCA9IHRoaXMuX2FkZFJlY29yZChSZWNvcmRUeXBlLkxvY2FsLCBhc3QubmFtZSwgYXN0Lm5hbWUsIFtdLCBudWxsLCByZWNlaXZlcik7XG4gICAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuSW52b2tlQ2xvc3VyZSwgJ2Nsb3N1cmUnLCBudWxsLCBhcmdzLCBudWxsLCB0YXJnZXQpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuSW52b2tlTWV0aG9kLCBhc3QubmFtZSwgYXN0LmZuLCBhcmdzLCBudWxsLCByZWNlaXZlcik7XG4gICAgfVxuICB9XG5cbiAgdmlzaXRTYWZlTWV0aG9kQ2FsbChhc3Q6IFNhZmVNZXRob2RDYWxsKTogbnVtYmVyIHtcbiAgICB2YXIgcmVjZWl2ZXIgPSBhc3QucmVjZWl2ZXIudmlzaXQodGhpcyk7XG4gICAgdmFyIGFyZ3MgPSB0aGlzLl92aXNpdEFsbChhc3QuYXJncyk7XG4gICAgcmV0dXJuIHRoaXMuX2FkZFJlY29yZChSZWNvcmRUeXBlLlNhZmVNZXRob2RJbnZva2UsIGFzdC5uYW1lLCBhc3QuZm4sIGFyZ3MsIG51bGwsIHJlY2VpdmVyKTtcbiAgfVxuXG4gIHZpc2l0RnVuY3Rpb25DYWxsKGFzdDogRnVuY3Rpb25DYWxsKTogbnVtYmVyIHtcbiAgICB2YXIgdGFyZ2V0ID0gYXN0LnRhcmdldC52aXNpdCh0aGlzKTtcbiAgICB2YXIgYXJncyA9IHRoaXMuX3Zpc2l0QWxsKGFzdC5hcmdzKTtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuSW52b2tlQ2xvc3VyZSwgJ2Nsb3N1cmUnLCBudWxsLCBhcmdzLCBudWxsLCB0YXJnZXQpO1xuICB9XG5cbiAgdmlzaXRMaXRlcmFsQXJyYXkoYXN0OiBMaXRlcmFsQXJyYXkpOiBudW1iZXIge1xuICAgIHZhciBwcmltaXRpdmVOYW1lID0gYGFycmF5Rm4ke2FzdC5leHByZXNzaW9ucy5sZW5ndGh9YDtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFxuICAgICAgICBSZWNvcmRUeXBlLkNvbGxlY3Rpb25MaXRlcmFsLCBwcmltaXRpdmVOYW1lLCBfYXJyYXlGbihhc3QuZXhwcmVzc2lvbnMubGVuZ3RoKSxcbiAgICAgICAgdGhpcy5fdmlzaXRBbGwoYXN0LmV4cHJlc3Npb25zKSwgbnVsbCwgMCk7XG4gIH1cblxuICB2aXNpdExpdGVyYWxNYXAoYXN0OiBMaXRlcmFsTWFwKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFxuICAgICAgICBSZWNvcmRUeXBlLkNvbGxlY3Rpb25MaXRlcmFsLCBfbWFwUHJpbWl0aXZlTmFtZShhc3Qua2V5cyksXG4gICAgICAgIENoYW5nZURldGVjdGlvblV0aWwubWFwRm4oYXN0LmtleXMpLCB0aGlzLl92aXNpdEFsbChhc3QudmFsdWVzKSwgbnVsbCwgMCk7XG4gIH1cblxuICB2aXNpdEJpbmFyeShhc3Q6IEJpbmFyeSk6IG51bWJlciB7XG4gICAgdmFyIGxlZnQgPSBhc3QubGVmdC52aXNpdCh0aGlzKTtcbiAgICBzd2l0Y2ggKGFzdC5vcGVyYXRpb24pIHtcbiAgICAgIGNhc2UgJyYmJzpcbiAgICAgICAgdmFyIGJyYW5jaEVuZCA9IFtudWxsXTtcbiAgICAgICAgdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuU2tpcFJlY29yZHNJZk5vdCwgJ1NraXBSZWNvcmRzSWZOb3QnLCBudWxsLCBbXSwgYnJhbmNoRW5kLCBsZWZ0KTtcbiAgICAgICAgdmFyIHJpZ2h0ID0gYXN0LnJpZ2h0LnZpc2l0KHRoaXMpO1xuICAgICAgICBicmFuY2hFbmRbMF0gPSByaWdodDtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZFJlY29yZChcbiAgICAgICAgICAgIFJlY29yZFR5cGUuUHJpbWl0aXZlT3AsICdjb25kJywgQ2hhbmdlRGV0ZWN0aW9uVXRpbC5jb25kLCBbbGVmdCwgcmlnaHQsIGxlZnRdLCBudWxsLCAwKTtcblxuICAgICAgY2FzZSAnfHwnOlxuICAgICAgICB2YXIgYnJhbmNoRW5kID0gW251bGxdO1xuICAgICAgICB0aGlzLl9hZGRSZWNvcmQoUmVjb3JkVHlwZS5Ta2lwUmVjb3Jkc0lmLCAnU2tpcFJlY29yZHNJZicsIG51bGwsIFtdLCBicmFuY2hFbmQsIGxlZnQpO1xuICAgICAgICB2YXIgcmlnaHQgPSBhc3QucmlnaHQudmlzaXQodGhpcyk7XG4gICAgICAgIGJyYW5jaEVuZFswXSA9IHJpZ2h0O1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFxuICAgICAgICAgICAgUmVjb3JkVHlwZS5QcmltaXRpdmVPcCwgJ2NvbmQnLCBDaGFuZ2VEZXRlY3Rpb25VdGlsLmNvbmQsIFtsZWZ0LCBsZWZ0LCByaWdodF0sIG51bGwsIDApO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB2YXIgcmlnaHQgPSBhc3QucmlnaHQudmlzaXQodGhpcyk7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRSZWNvcmQoXG4gICAgICAgICAgICBSZWNvcmRUeXBlLlByaW1pdGl2ZU9wLCBfb3BlcmF0aW9uVG9QcmltaXRpdmVOYW1lKGFzdC5vcGVyYXRpb24pLFxuICAgICAgICAgICAgX29wZXJhdGlvblRvRnVuY3Rpb24oYXN0Lm9wZXJhdGlvbiksIFtsZWZ0LCByaWdodF0sIG51bGwsIDApO1xuICAgIH1cbiAgfVxuXG4gIHZpc2l0UHJlZml4Tm90KGFzdDogUHJlZml4Tm90KTogbnVtYmVyIHtcbiAgICB2YXIgZXhwID0gYXN0LmV4cHJlc3Npb24udmlzaXQodGhpcyk7XG4gICAgcmV0dXJuIHRoaXMuX2FkZFJlY29yZChcbiAgICAgICAgUmVjb3JkVHlwZS5QcmltaXRpdmVPcCwgJ29wZXJhdGlvbl9uZWdhdGUnLCBDaGFuZ2VEZXRlY3Rpb25VdGlsLm9wZXJhdGlvbl9uZWdhdGUsIFtleHBdLFxuICAgICAgICBudWxsLCAwKTtcbiAgfVxuXG4gIHZpc2l0Q29uZGl0aW9uYWwoYXN0OiBDb25kaXRpb25hbCk6IG51bWJlciB7XG4gICAgdmFyIGNvbmRpdGlvbiA9IGFzdC5jb25kaXRpb24udmlzaXQodGhpcyk7XG4gICAgdmFyIHN0YXJ0T2ZGYWxzZUJyYW5jaCA9IFtudWxsXTtcbiAgICB2YXIgZW5kT2ZGYWxzZUJyYW5jaCA9IFtudWxsXTtcbiAgICB0aGlzLl9hZGRSZWNvcmQoXG4gICAgICAgIFJlY29yZFR5cGUuU2tpcFJlY29yZHNJZk5vdCwgJ1NraXBSZWNvcmRzSWZOb3QnLCBudWxsLCBbXSwgc3RhcnRPZkZhbHNlQnJhbmNoLCBjb25kaXRpb24pO1xuICAgIHZhciB3aGVuVHJ1ZSA9IGFzdC50cnVlRXhwLnZpc2l0KHRoaXMpO1xuICAgIHZhciBza2lwID1cbiAgICAgICAgdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuU2tpcFJlY29yZHMsICdTa2lwUmVjb3JkcycsIG51bGwsIFtdLCBlbmRPZkZhbHNlQnJhbmNoLCAwKTtcbiAgICB2YXIgd2hlbkZhbHNlID0gYXN0LmZhbHNlRXhwLnZpc2l0KHRoaXMpO1xuICAgIHN0YXJ0T2ZGYWxzZUJyYW5jaFswXSA9IHNraXA7XG4gICAgZW5kT2ZGYWxzZUJyYW5jaFswXSA9IHdoZW5GYWxzZTtcblxuICAgIHJldHVybiB0aGlzLl9hZGRSZWNvcmQoXG4gICAgICAgIFJlY29yZFR5cGUuUHJpbWl0aXZlT3AsICdjb25kJywgQ2hhbmdlRGV0ZWN0aW9uVXRpbC5jb25kLCBbY29uZGl0aW9uLCB3aGVuVHJ1ZSwgd2hlbkZhbHNlXSxcbiAgICAgICAgbnVsbCwgMCk7XG4gIH1cblxuICB2aXNpdFBpcGUoYXN0OiBCaW5kaW5nUGlwZSk6IG51bWJlciB7XG4gICAgdmFyIHZhbHVlID0gYXN0LmV4cC52aXNpdCh0aGlzKTtcbiAgICB2YXIgYXJncyA9IHRoaXMuX3Zpc2l0QWxsKGFzdC5hcmdzKTtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuUGlwZSwgYXN0Lm5hbWUsIGFzdC5uYW1lLCBhcmdzLCBudWxsLCB2YWx1ZSk7XG4gIH1cblxuICB2aXNpdEtleWVkUmVhZChhc3Q6IEtleWVkUmVhZCk6IG51bWJlciB7XG4gICAgdmFyIG9iaiA9IGFzdC5vYmoudmlzaXQodGhpcyk7XG4gICAgdmFyIGtleSA9IGFzdC5rZXkudmlzaXQodGhpcyk7XG4gICAgcmV0dXJuIHRoaXMuX2FkZFJlY29yZChcbiAgICAgICAgUmVjb3JkVHlwZS5LZXllZFJlYWQsICdrZXllZEFjY2VzcycsIENoYW5nZURldGVjdGlvblV0aWwua2V5ZWRBY2Nlc3MsIFtrZXldLCBudWxsLCBvYmopO1xuICB9XG5cbiAgdmlzaXRDaGFpbihhc3Q6IENoYWluKTogbnVtYmVyIHtcbiAgICB2YXIgYXJncyA9IGFzdC5leHByZXNzaW9ucy5tYXAoZSA9PiBlLnZpc2l0KHRoaXMpKTtcbiAgICByZXR1cm4gdGhpcy5fYWRkUmVjb3JkKFJlY29yZFR5cGUuQ2hhaW4sICdjaGFpbicsIG51bGwsIGFyZ3MsIG51bGwsIDApO1xuICB9XG5cbiAgdmlzaXRRdW90ZShhc3Q6IFF1b3RlKTogdm9pZCB7XG4gICAgdGhyb3cgbmV3IEJhc2VFeGNlcHRpb24oXG4gICAgICAgIGBDYXVnaHQgdW5pbnRlcnByZXRlZCBleHByZXNzaW9uIGF0ICR7YXN0LmxvY2F0aW9ufTogJHthc3QudW5pbnRlcnByZXRlZEV4cHJlc3Npb259LiBgICtcbiAgICAgICAgYEV4cHJlc3Npb24gcHJlZml4ICR7YXN0LnByZWZpeH0gZGlkIG5vdCBtYXRjaCBhIHRlbXBsYXRlIHRyYW5zZm9ybWVyIHRvIGludGVycHJldCB0aGUgZXhwcmVzc2lvbi5gKTtcbiAgfVxuXG4gIHByaXZhdGUgX3Zpc2l0QWxsKGFzdHM6IGFueVtdKSB7XG4gICAgdmFyIHJlcyA9IExpc3RXcmFwcGVyLmNyZWF0ZUZpeGVkU2l6ZShhc3RzLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhc3RzLmxlbmd0aDsgKytpKSB7XG4gICAgICByZXNbaV0gPSBhc3RzW2ldLnZpc2l0KHRoaXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYSBgUHJvdG9SZWNvcmRgIGFuZCByZXR1cm5zIGl0cyBzZWxmSW5kZXguXG4gICAqL1xuICBwcml2YXRlIF9hZGRSZWNvcmQodHlwZSwgbmFtZSwgZnVuY09yVmFsdWUsIGFyZ3MsIGZpeGVkQXJncywgY29udGV4dCk6IG51bWJlciB7XG4gICAgdmFyIHNlbGZJbmRleCA9IHRoaXMuX3JlY29yZHMubGVuZ3RoICsgMTtcbiAgICBpZiAoY29udGV4dCBpbnN0YW5jZW9mIERpcmVjdGl2ZUluZGV4KSB7XG4gICAgICB0aGlzLl9yZWNvcmRzLnB1c2gobmV3IFByb3RvUmVjb3JkKFxuICAgICAgICAgIHR5cGUsIG5hbWUsIGZ1bmNPclZhbHVlLCBhcmdzLCBmaXhlZEFyZ3MsIC0xLCBjb250ZXh0LCBzZWxmSW5kZXgsIHRoaXMuX2JpbmRpbmdSZWNvcmQsXG4gICAgICAgICAgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIHRoaXMuX2JpbmRpbmdJbmRleCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9yZWNvcmRzLnB1c2gobmV3IFByb3RvUmVjb3JkKFxuICAgICAgICAgIHR5cGUsIG5hbWUsIGZ1bmNPclZhbHVlLCBhcmdzLCBmaXhlZEFyZ3MsIGNvbnRleHQsIG51bGwsIHNlbGZJbmRleCwgdGhpcy5fYmluZGluZ1JlY29yZCxcbiAgICAgICAgICBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgdGhpcy5fYmluZGluZ0luZGV4KSk7XG4gICAgfVxuICAgIHJldHVybiBzZWxmSW5kZXg7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBfYXJyYXlGbihsZW5ndGg6IG51bWJlcik6IEZ1bmN0aW9uIHtcbiAgc3dpdGNoIChsZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuMDtcbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuMTtcbiAgICBjYXNlIDI6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuMjtcbiAgICBjYXNlIDM6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuMztcbiAgICBjYXNlIDQ6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuNDtcbiAgICBjYXNlIDU6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuNTtcbiAgICBjYXNlIDY6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuNjtcbiAgICBjYXNlIDc6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuNztcbiAgICBjYXNlIDg6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuODtcbiAgICBjYXNlIDk6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5hcnJheUZuOTtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEJhc2VFeGNlcHRpb24oYERvZXMgbm90IHN1cHBvcnQgbGl0ZXJhbCBtYXBzIHdpdGggbW9yZSB0aGFuIDkgZWxlbWVudHNgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBfbWFwUHJpbWl0aXZlTmFtZShrZXlzOiBhbnlbXSkge1xuICB2YXIgc3RyaW5naWZpZWRLZXlzID0ga2V5cy5tYXAoayA9PiBpc1N0cmluZyhrKSA/IGBcIiR7a31cImAgOiBgJHtrfWApLmpvaW4oJywgJyk7XG4gIHJldHVybiBgbWFwRm4oWyR7c3RyaW5naWZpZWRLZXlzfV0pYDtcbn1cblxuZnVuY3Rpb24gX29wZXJhdGlvblRvUHJpbWl0aXZlTmFtZShvcGVyYXRpb246IHN0cmluZyk6IHN0cmluZyB7XG4gIHN3aXRjaCAob3BlcmF0aW9uKSB7XG4gICAgY2FzZSAnKyc6XG4gICAgICByZXR1cm4gJ29wZXJhdGlvbl9hZGQnO1xuICAgIGNhc2UgJy0nOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25fc3VidHJhY3QnO1xuICAgIGNhc2UgJyonOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25fbXVsdGlwbHknO1xuICAgIGNhc2UgJy8nOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25fZGl2aWRlJztcbiAgICBjYXNlICclJzpcbiAgICAgIHJldHVybiAnb3BlcmF0aW9uX3JlbWFpbmRlcic7XG4gICAgY2FzZSAnPT0nOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25fZXF1YWxzJztcbiAgICBjYXNlICchPSc6XG4gICAgICByZXR1cm4gJ29wZXJhdGlvbl9ub3RfZXF1YWxzJztcbiAgICBjYXNlICc9PT0nOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25faWRlbnRpY2FsJztcbiAgICBjYXNlICchPT0nOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25fbm90X2lkZW50aWNhbCc7XG4gICAgY2FzZSAnPCc6XG4gICAgICByZXR1cm4gJ29wZXJhdGlvbl9sZXNzX3RoZW4nO1xuICAgIGNhc2UgJz4nOlxuICAgICAgcmV0dXJuICdvcGVyYXRpb25fZ3JlYXRlcl90aGVuJztcbiAgICBjYXNlICc8PSc6XG4gICAgICByZXR1cm4gJ29wZXJhdGlvbl9sZXNzX29yX2VxdWFsc190aGVuJztcbiAgICBjYXNlICc+PSc6XG4gICAgICByZXR1cm4gJ29wZXJhdGlvbl9ncmVhdGVyX29yX2VxdWFsc190aGVuJztcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEJhc2VFeGNlcHRpb24oYFVuc3VwcG9ydGVkIG9wZXJhdGlvbiAke29wZXJhdGlvbn1gKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBfb3BlcmF0aW9uVG9GdW5jdGlvbihvcGVyYXRpb246IHN0cmluZyk6IEZ1bmN0aW9uIHtcbiAgc3dpdGNoIChvcGVyYXRpb24pIHtcbiAgICBjYXNlICcrJzpcbiAgICAgIHJldHVybiBDaGFuZ2VEZXRlY3Rpb25VdGlsLm9wZXJhdGlvbl9hZGQ7XG4gICAgY2FzZSAnLSc6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25fc3VidHJhY3Q7XG4gICAgY2FzZSAnKic6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25fbXVsdGlwbHk7XG4gICAgY2FzZSAnLyc6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25fZGl2aWRlO1xuICAgIGNhc2UgJyUnOlxuICAgICAgcmV0dXJuIENoYW5nZURldGVjdGlvblV0aWwub3BlcmF0aW9uX3JlbWFpbmRlcjtcbiAgICBjYXNlICc9PSc6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25fZXF1YWxzO1xuICAgIGNhc2UgJyE9JzpcbiAgICAgIHJldHVybiBDaGFuZ2VEZXRlY3Rpb25VdGlsLm9wZXJhdGlvbl9ub3RfZXF1YWxzO1xuICAgIGNhc2UgJz09PSc6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25faWRlbnRpY2FsO1xuICAgIGNhc2UgJyE9PSc6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25fbm90X2lkZW50aWNhbDtcbiAgICBjYXNlICc8JzpcbiAgICAgIHJldHVybiBDaGFuZ2VEZXRlY3Rpb25VdGlsLm9wZXJhdGlvbl9sZXNzX3RoZW47XG4gICAgY2FzZSAnPic6XG4gICAgICByZXR1cm4gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5vcGVyYXRpb25fZ3JlYXRlcl90aGVuO1xuICAgIGNhc2UgJzw9JzpcbiAgICAgIHJldHVybiBDaGFuZ2VEZXRlY3Rpb25VdGlsLm9wZXJhdGlvbl9sZXNzX29yX2VxdWFsc190aGVuO1xuICAgIGNhc2UgJz49JzpcbiAgICAgIHJldHVybiBDaGFuZ2VEZXRlY3Rpb25VdGlsLm9wZXJhdGlvbl9ncmVhdGVyX29yX2VxdWFsc190aGVuO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgQmFzZUV4Y2VwdGlvbihgVW5zdXBwb3J0ZWQgb3BlcmF0aW9uICR7b3BlcmF0aW9ufWApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHModik6IHN0cmluZyB7XG4gIHJldHVybiBpc1ByZXNlbnQodikgPyBgJHt2fWAgOiAnJztcbn1cblxuZnVuY3Rpb24gX2ludGVycG9sYXRpb25GbihzdHJpbmdzOiBhbnlbXSkge1xuICB2YXIgbGVuZ3RoID0gc3RyaW5ncy5sZW5ndGg7XG4gIHZhciBjMCA9IGxlbmd0aCA+IDAgPyBzdHJpbmdzWzBdIDogbnVsbDtcbiAgdmFyIGMxID0gbGVuZ3RoID4gMSA/IHN0cmluZ3NbMV0gOiBudWxsO1xuICB2YXIgYzIgPSBsZW5ndGggPiAyID8gc3RyaW5nc1syXSA6IG51bGw7XG4gIHZhciBjMyA9IGxlbmd0aCA+IDMgPyBzdHJpbmdzWzNdIDogbnVsbDtcbiAgdmFyIGM0ID0gbGVuZ3RoID4gNCA/IHN0cmluZ3NbNF0gOiBudWxsO1xuICB2YXIgYzUgPSBsZW5ndGggPiA1ID8gc3RyaW5nc1s1XSA6IG51bGw7XG4gIHZhciBjNiA9IGxlbmd0aCA+IDYgPyBzdHJpbmdzWzZdIDogbnVsbDtcbiAgdmFyIGM3ID0gbGVuZ3RoID4gNyA/IHN0cmluZ3NbN10gOiBudWxsO1xuICB2YXIgYzggPSBsZW5ndGggPiA4ID8gc3RyaW5nc1s4XSA6IG51bGw7XG4gIHZhciBjOSA9IGxlbmd0aCA+IDkgPyBzdHJpbmdzWzldIDogbnVsbDtcbiAgc3dpdGNoIChsZW5ndGggLSAxKSB7XG4gICAgY2FzZSAxOlxuICAgICAgcmV0dXJuIChhMSkgPT4gYzAgKyBzKGExKSArIGMxO1xuICAgIGNhc2UgMjpcbiAgICAgIHJldHVybiAoYTEsIGEyKSA9PiBjMCArIHMoYTEpICsgYzEgKyBzKGEyKSArIGMyO1xuICAgIGNhc2UgMzpcbiAgICAgIHJldHVybiAoYTEsIGEyLCBhMykgPT4gYzAgKyBzKGExKSArIGMxICsgcyhhMikgKyBjMiArIHMoYTMpICsgYzM7XG4gICAgY2FzZSA0OlxuICAgICAgcmV0dXJuIChhMSwgYTIsIGEzLCBhNCkgPT4gYzAgKyBzKGExKSArIGMxICsgcyhhMikgKyBjMiArIHMoYTMpICsgYzMgKyBzKGE0KSArIGM0O1xuICAgIGNhc2UgNTpcbiAgICAgIHJldHVybiAoYTEsIGEyLCBhMywgYTQsIGE1KSA9PlxuICAgICAgICAgICAgICAgICBjMCArIHMoYTEpICsgYzEgKyBzKGEyKSArIGMyICsgcyhhMykgKyBjMyArIHMoYTQpICsgYzQgKyBzKGE1KSArIGM1O1xuICAgIGNhc2UgNjpcbiAgICAgIHJldHVybiAoYTEsIGEyLCBhMywgYTQsIGE1LCBhNikgPT5cbiAgICAgICAgICAgICAgICAgYzAgKyBzKGExKSArIGMxICsgcyhhMikgKyBjMiArIHMoYTMpICsgYzMgKyBzKGE0KSArIGM0ICsgcyhhNSkgKyBjNSArIHMoYTYpICsgYzY7XG4gICAgY2FzZSA3OlxuICAgICAgcmV0dXJuIChhMSwgYTIsIGEzLCBhNCwgYTUsIGE2LCBhNykgPT4gYzAgKyBzKGExKSArIGMxICsgcyhhMikgKyBjMiArIHMoYTMpICsgYzMgKyBzKGE0KSArXG4gICAgICAgICAgYzQgKyBzKGE1KSArIGM1ICsgcyhhNikgKyBjNiArIHMoYTcpICsgYzc7XG4gICAgY2FzZSA4OlxuICAgICAgcmV0dXJuIChhMSwgYTIsIGEzLCBhNCwgYTUsIGE2LCBhNywgYTgpID0+IGMwICsgcyhhMSkgKyBjMSArIHMoYTIpICsgYzIgKyBzKGEzKSArIGMzICsgcyhhNCkgK1xuICAgICAgICAgIGM0ICsgcyhhNSkgKyBjNSArIHMoYTYpICsgYzYgKyBzKGE3KSArIGM3ICsgcyhhOCkgKyBjODtcbiAgICBjYXNlIDk6XG4gICAgICByZXR1cm4gKGExLCBhMiwgYTMsIGE0LCBhNSwgYTYsIGE3LCBhOCwgYTkpID0+IGMwICsgcyhhMSkgKyBjMSArIHMoYTIpICsgYzIgKyBzKGEzKSArIGMzICtcbiAgICAgICAgICBzKGE0KSArIGM0ICsgcyhhNSkgKyBjNSArIHMoYTYpICsgYzYgKyBzKGE3KSArIGM3ICsgcyhhOCkgKyBjOCArIHMoYTkpICsgYzk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBCYXNlRXhjZXB0aW9uKGBEb2VzIG5vdCBzdXBwb3J0IG1vcmUgdGhhbiA5IGV4cHJlc3Npb25zYCk7XG4gIH1cbn1cbiJdfQ==