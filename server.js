/**
 * @file
 * API for remote logging.
 *
 * @author
 * Stian Hanger <pdnagilum@gmail.com>
 */

'use strict';

    // Include all needed external modules.
var async      = require('async'),
    bodyParser = require('body-parser'),
    crypto     = require('crypto'),
    express    = require('express'),
    jade       = require('jade'),
    mongodb    = require('mongodb'),

    // Prepare local vars.
    app         = express(),
    collections = { "entries": null, "tokens": null },
    db          = null,
    database    = mongodb.MongoClient;

// Setup various express aspects.
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/assets', express.static(__dirname + '/public'));

async.waterfall(
  [
    /**
     * Attempt to connect to the mongo database.
     *
     * @param function cb
     *   The callback function.
     */
    function (cb) {
      if (process.env.OBSERVER_MONGODB_CONNECTION_STRING) {
        mongodb.connect(process.env.OBSERVER_MONGODB_CONNECTION_STRING, function (err, con) {
          cb(err, con);
        });
      }
      else {
        cb(new Error('Required environmental variable OBSERVER_MONGODB_CONNECTION_STRING is missing.'));
      }
    },

    /**
     * Attempts to create the collections, if needed.
     *
     * @param connection con
     *   The established mongo database connection.
     * @param function cb
     *   The callback function.
     */
    function (con, cb) {
      con.createCollection('tokens', function (err, col) {
        if (err) {
          cb(err);
        }
        else {
          collections.tokens = col;
        }
      });

      con.createCollection('entries', function (err, col) {
        if (err) {
          cb(err);
        }
        else {
          collections.entries = col;
        }
      });

      cb(null, con);
    }
  ],

  /**
   * All verification is done. If an error occured, terminate the app.
   *
   * @param string err
   *   The errror, if any.
   * @param object con
   *   The database connection.
   */
  function (err, con) {
    if (err) {
      console.error(err);

      if (con) {
        con
          .end()
          .destroy();
      }

      process.exit(1);
    }

    if (con) {
      db = con;
    }
  }
);

/**
 * Present the front page.
 */
app.get('/', function (req, res, next) {
  res
    .status(200)
    .end(jade.renderFile('templates/source/frontpage.jade'));
});

app.get('/test', function (req, res, next) {
  collections.entries.insert({
    token:   '5c0abbdc1a47adfeb48a8c4e0b3d1b1e',
    created: new Date(),
    data:    '',
    type:    'System.Windows.Form.MessageBox.Something.Something.DarkSide'
  },
  {
    w: 1
  },
  function (err, recs) {
    res
      .status(200)
      .end('');
  });
});

/**
 * Display a formatted page with entries from passed token.
 */
app.get('/view/:token', function (req, res, next) {
  async.waterfall(
    [
      /**
       * Load the token from the database.
       *
       * @param function cb
       *   The callback function.
       */
      function (cb) {
        collections.tokens.findOne({
          token: req.params.token
        }, function (err, rec) {
          if (err) {
            cb(err);
          }
          else if (rec === null) {
            res
              .status(404)
              .end();
          }
          else {
            cb(null, rec);
          }
        })
      },

      /**
       * Load entries related to the token from the database.
       *
       * @param record token
       *   The loaded token.
       * @param function cb
       *   The callback function.
       */
      function (token, cb) {
        collections.entries.find({
          token: token.token
        }).toArray(function (err, recs) {
          if (err) {
            cb(err);
          }
          else {
            cb(null, token, recs);
          }
        });
      }
    ],

    /**
     * Token and entries are loaded, hopefully without errors.
     *
     * @param string err
     *   The error, if any.
     * @param record token
     *   The loaded token.
     * @param records entries
     *   The loaded entries.
     */
    function (err, token, entries) {
      if (err) {
        res
          .status(500)
          .end(err);
      }
      else {
        res
          .status(200)
          .end(jade.renderFile('templates/source/view-token.jade',
            {
              token:   token,
              entries: entries,
              pretty:  true
            }));
      }
    }
  );
});

/**
 * Display a formatted page with a single entry from the passed token.
 */
app.get('/view/:token/:id', function (req, res, next) {
  res
    .status(200)
    .json({});
});

/**
 * Get a JSON of all entries related to passed token.
 */
app.get('/api/token', function (req, res, next) {
  res
    .status(200)
    .json({});
});

/**
 * Create a new log token.
 */
app.post('/api/token', function (req, res, next) {
  var index = new Date().getTime(),
      token = null,
      hash  = crypto
                .createHash('md5')
                .update(index.toString())
                .digest('hex');

  async.whilst(
    /**
     * Check if a successful token has been found.
     */
    function () {
      return (token === null);
    },

    /**
     * Check the database if the token already exist.
     *
     * @param function cb
     *   The callback function.
     */
    function (cb) {
      collections.tokens.findOne({
        token: hash
      }, function (err, rec) {
        if (err) {
          cb(err);
        }

        if (rec === null) {
          token = hash;
        }
        else {
          index++;
          hash = crypto
                   .createHash('md5')
                   .update(index.toString())
                   .digest('hex');
        }

        cb();
      })
    },

    /**
     * Everything is done, hopefully without errors.
     *
     * @param string err
     *   The error, if any.
     */
    function (err) {
      if (err) {
        console.error(err);

        res
          .status(500)
          .end(err);
      }

      collections.tokens.insert({
        token:       token,
        created:     new Date(),
        changed:     new Date(),
        expire:      null,
        description: null
      },
      {
        w: 1
      },
      function (err, recs) {
        if (err) {
          console.error(err);

          res
            .status(500)
            .end(err);
        }
        else {
          if (recs.length > 0) {
            res
              .status(200)
              .json(recs[0]);
          }
          else {
            console.error('Unable to insert new token.');

            res
              .status(500)
              .end(err);
          }
        }
      });
    }
  );
});

/**
 * Update an existing token.
 */
app.put('/api/token', function (req, res, next) {
  var set = {};

  if (req.body.description) { set.description = req.body.description; }
  if (req.body.expire)      { set.expire      = req.body.expire; }

  if (!set.description &&
      !set.expire) {
    res
      .status(400)
      .end();
  }

  set.changed = new Date();

  collections.tokens.findAndModify({
    token: req.body.token
  },
  null,
  {
    $set: set
  },
  function (err, rec) {
    if (err) {
      res
        .status(500)
        .end(err);
    }
    else if (rec === null) {
      res
        .status(404)
        .end();
    }
    else {
      if (set.description) { rec.description = set.description; }
      if (set.expire)      { rec.expire      = set.expire; }

      rec.changed = set.changed;

      res
        .status(200)
        .json(rec);
    }
  })
});

/**
 * Delete all entries, including token, for a passed token. This effectively
 * destroys the entire token-case.
 */
app.delete('/api/token', function (req, res, next) {
  res
    .status(200)
    .json({});
});

/**
 * Create a new log entry under a token.
 */
app.post('/api/entry', function (req, res, next) {
  if (!req.body.token ||
      !req.body.payload) {
    res
      .status(400)
      .end();
  }

  collections.entries.insert({
    token:   req.body.token,
    created: new Date(),
    data:    req.body.payload,
    type:    req.body.type,
    length:  req.body.length,
    logged:  req.body.logged,
    message: req.body.message
  },
  {
    w: 1
  },
  function (err, recs) {
    if (err) {
      res
        .status(500)
        .end(err);
    }
    else if (recs.length === 0) {
      req
        .status(400)
        .end();
    }
    else {
      res
        .status(100)
        .end();
    }
  });
});

/**
 * Delete a single entry.
 */
app.delete('/api/entry', function (req, res, next) {
  res
    .status(200)
    .json({});
});

// We're done setting up all the stuff, now we wait, in the shadows.
var ip = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1',
    lp = process.env.OPENSHIFT_NODEJS_PORT || 8080;

app.listen(lp, ip);
