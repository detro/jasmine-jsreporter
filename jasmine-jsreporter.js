/*
  This file is part of the Jasmine JSReporter project from Ivan De Marino.

  Copyright (C) 2011 Ivan De Marino (aka detro, aka detronizator), http://blog.ivandemarino.me, ivan.de.marino@gmail.com

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the <organization> nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL IVAN DE MARINO BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
(function (jasmine) {

  if (!jasmine) {
    throw new Error("[Jasmine JSReporter] 'Jasmine' library not found");
  }

  /*
    Simple timer implementation
  */
  var Timer = function () {};

  Timer.prototype.start = function () {
    this.startTime = new Date().getTime();
    return this;
  };

  Timer.prototype.elapsed = function () {
    if (this.startTime == null) {
      return -1;
    }
    return new Date().getTime() - this.startTime;
  };

  /*
    JSReporter compatible with Jasmine 2.0.0's event-driven style.
  */

  jasmine.JSReporter = function () {
    _.bindAll(this, 'getJSReport', 'getJSReportAsString');

    this.specs  = {};
    this.suites = {};
    this.rootSuites = [];
    this.suiteStack = [];
    this.done = false;

    // export methods under jasmine namespace
    jasmine.getJSReport = this.getJSReport;
    jasmine.getJSReportAsString = this.getJSReportAsString;
  };

  var JSR = jasmine.JSReporter.prototype;

  // Reporter API methods
  // --------------------

  JSR.suiteStarted = function (suite) {
    suite = this._cacheSuite(suite);
    // build up suite tree as we go
    suite.specs = [];
    suite.suites = [];
    suite.passed = true;
    suite.parentId = _.last(this.suiteStack);
    if (suite.parentId) {
      this.suites[suite.parentId].suites.push(suite);
    } else {
      this.rootSuites.push(suite.id);
    }
    this.suiteStack.push(suite.id);
    suite.timer = new Timer().start();
  };

  JSR.suiteDone = function (suite) {
    suite = this._cacheSuite(suite);
    suite.duration = suite.timer.elapsed();
    suite.durationSec = suite.duration / 1000;
    this.suiteStack.pop();

    // maintain parent suite state
    var parent = this.suites[suite.parentId];
    if (parent) {
      parent.passed = parent.passed && suite.passed;
    }

    // keep report representation clean
    delete suite.timer;
    delete suite.id;
    delete suite.parentId;
    delete suite.fullName;
  };

  JSR.specStarted = function (spec) {
    spec = this._cacheSpec(spec);
    spec.timer = new Timer().start();
    // build up suites->spec tree as we go
    spec.suiteId = _.last(this.suiteStack);
    this.suites[spec.suiteId].specs.push(spec);
  };

  JSR.specDone = function (spec) {
    spec = this._cacheSpec(spec);

    spec.duration = spec.timer.elapsed();
    spec.durationSec = spec.duration / 1000;

    spec.skipped = spec.status === 'pending';
    spec.passed = spec.skipped || spec.status === 'passed';

    // totalCount and passedCount will be populated if/when jasmine#575 gets accepted
    spec.totalCount = spec.totalExpectations || 0;
    spec.passedCount = spec.passedExpectations ? spec.passedExpectations.length : 0;

    spec.failedCount = spec.failedExpectations.length;

    spec.failures = _.map(spec.failedExpectations, function (fail) {
      return {
        type: 'expect',
        expected: fail.expected,
        passed: false,
        message: fail.message,
        matcherName: fail.matcherName,
        trace: {
          stack: fail.stack
        }
      };
    });

    // maintain parent suite state
    var parent = this.suites[spec.suiteId];
    if (spec.failed) {
      parent.failingSpecs.push(spec);
    }
    parent.passed = parent.passed && spec.passed;

    // keep report representation clean
    delete spec.timer;
    delete spec.totalExpectations;
    delete spec.passedExpectations;
    delete spec.suiteId;
    delete spec.fullName;
    delete spec.id;
    delete spec.status;
    delete spec.failedExpectations;
  };

  JSR.jasmineDone = function () {
    if (this.done) {
      return;
    }
    this._buildReport();
    this.done = true;
  };

  JSR.getJSReport = function () {
    if (this.done) {
      return this.report;
    }
  };

  JSR.getJSReportAsString = function () {
    if (this.done) {
      return JSON.stringify(this.report);
    }
  };

  // Private methods
  // ---------------

  JSR._haveSpec = function (spec) {
    return this.specs[spec.id] != null;
  };

  JSR._cacheSpec = function (spec) {
    var existing = this.specs[spec.id];
    if (existing == null) {
      existing = this.specs[spec.id] = _.clone(spec);
    } else {
      _.extend(existing, spec);
    }
    return existing;
  };

  JSR._haveSuite = function (suite) {
    return this.suites[suite.id] != null;
  };

  JSR._cacheSuite = function (suite) {
    var existing = this.suites[suite.id];
    if (existing == null) {
      existing = this.suites[suite.id] = _.clone(suite);
    } else {
      _.extend(existing, suite);
    }
    return existing;
  };

  JSR._buildReport = function () {
    var overallDuration = 0;
    var overallPassed = true;
    var overallSuites = [];

    _.each(this.rootSuites, function (suiteId) {
      var suite = this.suites[suiteId];
      overallDuration += suite.duration;
      overallPassed = overallPassed && suite.passed;
      overallSuites.push(suite);
    }, this);

    this.report = {
      passed: overallPassed,
      durationSec: overallDuration / 1000,
      suites: overallSuites
    };
  };

})(jasmine);