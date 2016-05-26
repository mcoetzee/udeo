/* globals describe it */
import { expect } from 'chai';
import { createStore } from '../';

describe('createStore', () => {
  describe('dispatch', () => {
    it('reaches all active streams', () => {
      const moduleOne = {
        flow(dispatch$) {
          return [dispatch$];
        },
        reducer(state = [], action) {
          return state.concat(action.type);
        },
      };
      const moduleTwo = {
        flow(dispatch$) {
          return [dispatch$];
        },
        reducer(state = [], action) {
          return state.concat(action.type);
        },
      };
      const store = createStore({
        moduleOne,
        moduleTwo,
      });

      let moduleOneState;
      const subOne = store.getState$('moduleOne').subscribe(state => {
        moduleOneState = state;
      });

      let moduleTwoState;
      const subTwo = store.getState$('moduleTwo').subscribe(state => {
        moduleTwoState = state;
      });

      store.dispatch({ type: '@test/FOO' });
      store.dispatch({ type: '@test/BAR' });

      expect(moduleOneState).to.deep.equal(['@udeo/INIT', '@test/FOO', '@test/BAR']);
      expect(moduleTwoState).to.deep.equal(['@udeo/INIT', '@test/FOO', '@test/BAR']);
      subOne.unsubscribe();
      subTwo.unsubscribe();
    });
  });
});
