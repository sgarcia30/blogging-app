'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for title, content, author
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding BlogPost data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  return BlogPost.insertMany(seedData);
}

// used to generate data to put in db
function generateTitle() {
  const blogTitle = [
    'Strangeness', 'It Happened Here', 'Do Not Ask', 'Tomorrow We Live Forever', 'Existential'];
  return blogTitle[Math.floor(Math.random() * blogTitle.length)];
}

// used to generate data to put in db
function generateContent() {
  const blogContent = ['Something Great', 'All the words', 'You will never believe it'];
  return blogContent[Math.floor(Math.random() * blogContent.length)];
}

// used to generate data to put in db
function generateAuthorName() {
  const authorName = [
    {
      firstName: 'Allan',
      lastName: 'Draheim'
    },
    {
      firstName: 'Betsy',
      lastName: 'Flournoy'
    },
    {
      firstName: 'Caroline',
      lastName: 'Osbourne'
    },
    {
      firstName: 'David',
      lastName: 'Baum'
    },
    {
      firstName: 'Frank',
      lastName: 'Garcia'
    }];
  return authorName[Math.floor(Math.random() * authorName.length)];
}

// generate an object representing a BlogPost.
// can be used to generate seed data for db
// or request.body data
function generateBlogPostData() {
  return {
    title: generateTitle(),
    content: generateContent(),
    author: generateAuthorName()
  };
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure data from one test does not stick
// around for next one
function tearDownDb() {
  console.warn('Deleting database');
  return mongoose.connection.dropDatabase();
}

describe('BlogPosts API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedBlogPostData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing BlogPosts', function() {
      // strategy:
      //    1. get back all BlogPosts returned by by GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of BlogPosts we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          // so subsequent .then blocks can access resp obj.
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          // console.log(res.body.length);
          // console.log(`here's what I'm looking for ${res.body.should.have.length.of.at.least(1)}`);
          res.body.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          res.body.should.have.length.of(count);
        });
    });


    it('should return blogposts with right fields', function() {
      // Strategy: Get back all blogposts, and ensure they have expected keys

      let resBlogPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(blogpost) {
            blogpost.should.be.a('object');
            blogpost.should.include.keys(
              'id', 'title', 'content', 'author');
          });
          resBlogPost = res.body.blogposts[0];
          return BlogPost.findById(resBlogPost.id);
        })
        .then(function(blogposts) {

          resBlogPost.id.should.equal(blogpost.id);
          resBlogPost.title.should.equal(blogpost.title);
          resBlogPost.content.should.equal(blogpost.content);
          resBlogPost.author.firstName.should.equal(blogpost.author.firstName);
          resBlogPost.author.lastName.should.equal(blogpost.author.lastName);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the BlogPost we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new BlogPost', function() {

      const newBlogPost = generateBlogPostData();
      let mostRecentGrade;

      return chai.request(app)
        .post('/posts')
        .send(newBlogPost)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'title', 'content', 'author');
          res.body.title.should.equal(newBlogPost.title);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.content.should.equal(newBlogPost.content);
          res.body.author.firstName.should.equal(newBlogPost.author.firstName);
          res.body.author.lastName.should.equal(newBlogPost.authorName.lastName);
          return BlogPost.findById(res.body.id);
        })
        .then(function(blogpost) {
          blogpost.title.should.equal(newBlogPost.title);
          blogpost.content.should.equal(newBlogPost.content);
          blogpost.author.firstName.should.equal(newBlogPost.author.firstName);
          blogpost.author.lastName.should.equal(newBlogPost.author.lastName);
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing BlogPost from db
    //  2. Make a PUT request to update that BlogPost
    //  3. Prove BlogPost returned by request contains data we sent
    //  4. Prove BlogPost in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        title: 'Hangman',
        content: `Dead men don't talk.`
      };

      return BlogPost
        .findOne()
        .then(function(blogpost) {
          updateData.id = blogpost.id;

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${blogpost.id}`)
            .send(updateData);
        })
        .then(function(res) {
          res.should.have.status(204);

          return BlogPost.findById(updateData.id);
        })
        .then(function(blogpost) {
          blogpost.title.should.equal(updateData.title);
          blogpost.content.should.equal(updateData.content);
        });
    });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a BlogPost
    //  2. make a DELETE request for that BlogPost's id
    //  3. assert that response has right status code
    //  4. prove that BlogPost with the id doesn't exist in db anymore
    it('delete a BlogPost by id', function() {

      let blogpost;

      return BlogPost
        .findOne()
        .then(function(_blogpost) {
          blogpost = _blogpost;
          return chai.request(app).delete(`/posts/${blogpost.id}`);
        })
        .then(function(res) {
          res.should.have.status(204);
          return BlogPost.findById(blogpost.id);
        })
        .then(function(_blogpost) {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_blogpost.should.be.null` would raise
          // an error. `should.be.null(_blogpost)` is how we can
          // make assertions about a null value.
          should.not.exist(_blogpost);
        });
    });
  });
});
