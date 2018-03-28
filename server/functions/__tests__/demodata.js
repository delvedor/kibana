import expect from 'expect.js';
import { demodata } from '../demodata';

const nullFilter = {
  type: 'filter',
  meta: {},
  size: null,
  sort: [],
  and: [],
};

const fn = demodata().fn;

describe('demodata', () => {
  it('ci, different object references', () => {
    const ci1 = fn(nullFilter, { _: 'ci' });
    const ci2 = fn(nullFilter, { _: 'ci' });
    expect(ci1).not.to.equal(ci2);
    expect(ci1.rows).not.to.equal(ci2.rows);
    expect(ci1.rows[0]).not.to.equal(ci2.rows[0]);
  });
  it('shirts, different object references', () => {
    const shirts1 = fn(nullFilter, { _: 'shirts' });
    const shirts2 = fn(nullFilter, { _: 'shirts' });
    expect(shirts1).not.to.be.equal(shirts2);
    expect(shirts1.rows).not.to.be.equal(shirts2.rows);
    expect(shirts1.rows[0]).not.to.be.equal(shirts2.rows[0]);
  });
  it('invalid set', () => {
    expect(fn)
      .withArgs(null, { _: 'foo' })
      .to.throwException(e => {
        expect(e.message).to.be("Invalid data set: foo, use 'ci' or 'shirts'.");
      });
  });
});
