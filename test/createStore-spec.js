/* globals describe it */
import { expect } from 'chai';
import { createStore } from '../';

describe('createStore', () => {
  describe('dispatch$', () => {
    it('reaches all active streams', () => {
      let moduleOne = {
        flow(dispatch$) { return [dispatch$]; },
        reducer(state = [], action) { return state.concat(action.type); },
      };
      let moduleTwo = {
        flow(dispatch$) { return [dispatch$]; },
        reducer(state = [], action) { return state.concat(action.type); },
      };
      let store = createStore({
        moduleOne,
        moduleTwo,
      });

      let moduleOneState;
      let subOne = store.getState$('moduleOne').subscribe(state => {
        moduleOneState = state;
      });

      let moduleTwoState;
      let subTwo = store.getState$('moduleTwo').subscribe(state => {
        moduleTwoState = state;
      });

      store.dispatch({ type: '@test/FOO' });
      store.dispatch({ type: '@test/BAR' });

      expect(moduleOneState).to.deep.equal(['@app/INIT', '@test/FOO', '@test/BAR']);
      expect(moduleTwoState).to.deep.equal(['@app/INIT', '@test/FOO', '@test/BAR']);
      subOne.unsubscribe();
      subTwo.unsubscribe();
    });
  });
});
