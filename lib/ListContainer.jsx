import { Meteor } from 'meteor/meteor';
import { createContainer } from 'meteor/react-meteor-data';
import React, { PropTypes, Component } from 'react';

import Utils from './utils.js'

const Subs = new SubsManager();

const ListContainer = React.createClass({

  getInitialState() {
    return {
      limit: this.props.limit
    };
  },

  mixins: [ReactMeteorData],
  
  getMeteorData() {

    // initialize data object with current user, and default to data being ready
    let data = {
      currentUser: Meteor.user(),
      ready: true
    };

    // subscribe if needed. Note: always subscribe first, otherwise 
    // it won't work when server-side rendering with FlowRouter SSR
    if (this.props.publication) {
      let terms = this.props.terms || {};

      if (terms.options) {
        terms.options.limit = this.state.limit;
      } else {
        terms.options = {limit: this.state.limit};
      }
      
      const subscribeFunction = this.props.cacheSubscription ? Subs.subscribe : Meteor.subscribe;
      const subscription = subscribeFunction(this.props.publication, terms);
      data.ready = subscription.ready();
    }

    const selector = this.props.selector || {};
    const options = {...this.props.options, limit: this.state.limit}; 

    const cursor = this.props.collection.find(selector, options);
    const count = cursor.count();

    // when rendering on the server, we want to get a count without the limit
    // note: doesn't quite work yet because of how FlowRouter SSR works
    // const optionsNoLimit = {...this.props.options, limit: 0}; 
    // const cursorNoLimit = this.props.collection.find(selector, optionsNoLimit);
    const totalCount = Meteor.isClient ? Counts && Counts.get(this.props.publication) : 0;

    let results = cursor.fetch(); 

    // look for any specified joins
    if (this.props.joins) {

      // loop over each document in the results
      results.forEach(document => {

        // loop over each join
        this.props.joins.forEach(join => {

          const collection = typeof join.collection === "function" ? join.collection() : join.collection;
          const joinLimit = join.limit ? join.limit : 0;

          if (join.foreignProperty) {
            // foreign join (e.g. comments belonging to a post)

            // get the property containing the id
            const foreignProperty = document[join.foreignProperty];
            const joinSelector = {};
            joinSelector[join.foreignProperty] = document._id;
            document[join.joinAs] = collection.find(joinSelector);

          } else {
            // local join (e.g. a post's upvoters)

            // get the property containing the id or ids
            const localProperty = document[join.localProperty];

            if (Array.isArray(localProperty)) { // join property is an array of ids
              document[join.joinAs] = collection.find({_id: {$in: localProperty}}, {limit: joinLimit}).fetch();
            } else { // join property is a single id
              document[join.joinAs] = collection.findOne({_id: localProperty});
            }
          }

            
        });

        // return the updated document
        return document;

      });
    }
    
    // transform list into tree
    if (this.props.parentProperty) {
      results = Utils.unflatten(results, "_id", this.props.parentProperty);
    }

    data = {
      ...data,
      count: count,
      totalCount: totalCount,
      hasMore: !totalCount || count < totalCount // if totalCount is unknown, default to true
    };

    data[this.props.resultsPropName] = results;

    return data;
  },

  loadMore(event) {
    event.preventDefault();
    this.setState({
      limit: this.state.limit+this.props.limit
    });
  },

  render() {
    if (this.props.component) {
      const Component = this.props.component;
      return <Component {...this.props.componentProps} {...this.data} loadMore={this.loadMore} />;
    } else {
      return React.cloneElement(this.props.children, { ...this.props.componentProps, ...this.data, loadMore: this.loadMore});
    }
  }

});

ListContainer.propTypes = {
  collection: React.PropTypes.object.isRequired, // the collection to paginate
  selector: React.PropTypes.object, // the selector used in collection.find()
  options: React.PropTypes.object, // the options used in collection.find()
  publication: React.PropTypes.string, // the publication to subscribe to
  terms: React.PropTypes.object, // an object passed to the publication
  limit: React.PropTypes.number, // the limit used to increase pagination
  joins: React.PropTypes.array, // joins to apply to the results
  parentProperty: React.PropTypes.string, // if provided, use to generate tree
  component: React.PropTypes.func, // another way to pass a child component
  componentProps: React.PropTypes.object, // the component's properties
  resultsPropName: React.PropTypes.string, // if provided, the name of the property to use for results
  cacheSubscription: React.PropTypes.bool // set to true to cache subscription using Subs Manager
}

ListContainer.defaultProps = {
  limit: 10,
  resultsPropName: "results",
  cacheSubscription: false
}

export default ListContainer;