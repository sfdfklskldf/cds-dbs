'use strict'
const cqn4sql = require('../../lib/cqn4sql')
const cds = require('@sap/cds')
const { expect } = cds.test

describe('Replace attribute search by search predicate', () => {
  let model
  beforeAll(async () => {
    model = cds.model = cds.compile.for.nodejs(await cds.load(`${__dirname}/../bookshop/db/schema`).then(cds.linked))
  })

  it('one string element with one search element', () => {
    // WithStructuredKey is the only entity with only one string element in the model ...
    let query = cds.ql`SELECT from bookshop.WithStructuredKey as wsk { second }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    // single val is stored as val directly, not as expr with val
    const expected = cds.ql`SELECT from bookshop.WithStructuredKey as wsk { wsk.second }`
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ ref: ['wsk', 'second']}] }, {val: 'x'}]}]
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('one string element', () => {
    // WithStructuredKey is the only entity with only one string element in the model ...
    let query = cds.ql`SELECT from bookshop.WithStructuredKey as wsk { second }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`SELECT from bookshop.WithStructuredKey as wsk { wsk.second }`
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ ref: ['wsk', 'second']}] }, {xpr: [{val: 'x'}, 'or', {val: 'y'}]}]}]
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('multiple string elements', () => {
    let query = cds.ql`SELECT from bookshop.Genres as Genres { ID }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(cds.ql`SELECT from bookshop.Genres as Genres {
      Genres.ID
    } where search((Genres.name, Genres.descr, Genres.code), ('x' OR 'y'))`)
  })

  it('with existing WHERE clause', () => {
    let query = cds.ql`SELECT from bookshop.Genres as Genres { ID } where ID < 4 or ID > 5`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(cds.ql`SELECT from bookshop.Genres as Genres {
      Genres.ID
    } where (Genres.ID < 4 or Genres.ID > 5)
        and search((Genres.name, Genres.descr, Genres.code), ('x' OR 'y'))`)
  })

  it('with filter on data source', () => {
    let query = cds.ql`SELECT from bookshop.Genres[ID < 4 or ID > 5] as Genres { ID }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    // todo, not necessary to add the search predicate as xpr
    const expected = cds.ql`SELECT from bookshop.Genres as Genres {
      Genres.ID
    } where search((Genres.name, Genres.descr, Genres.code), ('x' OR 'y')) and (Genres.ID < 4 or Genres.ID > 5)`
    expected.SELECT.where[0] = { xpr: [expected.SELECT.where[0]] }
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('string fields inside struct', () => {
    let query = cds.ql`SELECT from bookshop.Person as Person { ID }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(cds.ql`SELECT from bookshop.Person as Person {
      Person.ID
    } where search((Person.name, Person.placeOfBirth, Person.placeOfDeath, Person.address_street, Person.address_city), ('x' OR 'y'))`)
  })

  it('ignores virtual string elements', () => {
    let query = cds.ql`SELECT from bookshop.Foo as Foo { ID }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(cds.ql`SELECT from bookshop.Foo as Foo {
      Foo.ID
    }`)
  })
  it('Uses primary query source in case of joins', () => {
    let query = cds.ql`SELECT from bookshop.Books as Books { ID, author.books.title as authorsBook }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(
      cds.ql`
      SELECT from bookshop.Books as Books
        left join bookshop.Authors as author on author.ID = Books.author_ID
        left join bookshop.Books as books2 on  books2.author_ID = author.ID
      {
        Books.ID,
        books2.title as authorsBook
      } where search((Books.createdBy, Books.modifiedBy, Books.anotherText, Books.title, Books.descr, Books.currency_code, Books.dedication_text, Books.dedication_sub_foo, Books.dedication_dedication), ('x' OR 'y')) `,
    )
  })
  it('Search columns if result is grouped', () => {
    // in this case, we actually search the "title" which comes from the join
    let query = cds.ql`SELECT from bookshop.Books as Books { ID, author.books.title as authorsBook } group by title`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    const expected =       cds.ql`
    SELECT from bookshop.Books as Books
      left join bookshop.Authors as author on author.ID = Books.author_ID
      left join bookshop.Books as books2 on  books2.author_ID = author.ID
    {
      Books.ID,
      books2.title as authorsBook
    } where search(books2.title, ('x' OR 'y')) group by Books.title `
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ ref: ['books2', 'title']}] }, {xpr: [{val: 'x'}, 'or', {val: 'y'}]}]}]
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })
  it('Search on navigation', () => {
    let query = cds.ql`SELECT from bookshop.Authors:books as books { ID }`
    query.SELECT.search = [{ val: 'x' }, 'or', { val: 'y' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
      SELECT from bookshop.Books as books
      {
        books.ID,
      } where
        exists (
          SELECT 1 from bookshop.Authors as $A
          where $A.ID = books.author_ID
        )
      and
      search((books.createdBy, books.modifiedBy, books.anotherText, books.title, books.descr, books.currency_code, books.dedication_text, books.dedication_sub_foo, books.dedication_dedication), ('x' OR 'y')) `
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(
      expected,
    )
  })
  it('Search with aggregated column and groupby must be put into having', () => {
    // if we search on aggregated results, the search must be put into the having clause
    const { Books } = cds.entities
    let query = SELECT.from(Books)
      .alias('Books')
      .columns({ args: [{ ref: ['title'] }], as: 'firstInAlphabet', func: 'MIN' })
      .groupBy('title')
      .search('Cat')
    const expected = cds.ql`
    SELECT from bookshop.Books as Books {
      MIN(Books.title) as firstInAlphabet
    } group by Books.title having search(MIN(Books.title), 'Cat')`
    expected.SELECT.having = [ {func: 'search', args: [{ list: [{func: 'MIN', args: [{ ref: ['Books', 'title']}]}] }, {val: 'Cat'}]}]
    expect(JSON.parse(JSON.stringify(cqn4sql(query, model)))).to.deep.equal(expected)
  })

  it('Ignore non string aggregates from being searched', () => {
    const query = cds.ql`
      SELECT from bookshop.Books as Books {
        title,
        AVG(Books.stock) as searchRelevant,
      } group by title
      `

    query.SELECT.search = [{ val: 'x' }]
    const expected = cds.ql`
    SELECT from bookshop.Books as Books {
      Books.title,
      AVG(Books.stock) as searchRelevant,
    } where search(Books.title, 'x') group by Books.title`
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ ref: ['Books', 'title']}] }, {val: 'x'}]}]
    expect(JSON.parse(JSON.stringify(cqn4sql(query, model)))).to.deep.equal(expected)
  })
  it('aggregations which are not of type string are not searched', () => {
    const query = cds.ql`
      SELECT from bookshop.Books as Books {
        ID,
        SUM(Books.stock) as notSearchRelevant,
      } group by title
      `

    query.SELECT.search = [{ val: 'x' }]

    expect(JSON.parse(JSON.stringify(cqn4sql(query, model)))).to.deep.equal(cds.ql`
      SELECT from bookshop.Books as Books {
        Books.ID,
        SUM(Books.stock) as notSearchRelevant,
      } group by Books.title`)
  })
  it('func is search relevant via cast', () => {
    // this aggregation is not relevant for search per default
    // but due to the cast to string, we search
    const query = cds.ql`
      SELECT from bookshop.Books as Books {
        ID,
        substring(Books.stock) as searchRelevantViaCast: cds.String,
      } group by title
      `

    query.SELECT.search = [{ val: 'x' }]
    const expected = cds.ql`
    SELECT from bookshop.Books as Books {
      Books.ID,
      substring(Books.stock) as searchRelevantViaCast: cds.String,
    } group by Books.title having search(substring(Books.stock), 'x')`
    expected.SELECT.having = [ {func: 'search', args: [{ list: [{
      args: [ { ref: [ 'Books', 'stock' ] } ],
      func: 'substring'
    }] }, {val: 'x'}]}]
    expect(JSON.parse(JSON.stringify(cqn4sql(query, model)))).to.deep.equal(expected)
  })
  it('xpr is search relevant via cast', () => {
    // this aggregation is not relevant for search per default
    // but due to the cast to string, we search
    const query = cds.ql`
      SELECT from bookshop.Books as Books {
        ID,
        ('very' + 'useful' + 'string') as searchRelevantViaCast: cds.String,
        ('1' + '2' + '3') as notSearchRelevant: cds.Integer,
      } group by title
      `

    query.SELECT.search = [{ val: 'x' }]
    const expected = cds.ql`
    SELECT from bookshop.Books as Books {
      Books.ID,
      ('very' + 'useful' + 'string') as searchRelevantViaCast: cds.String,
      ('1' + '2' + '3') as notSearchRelevant: cds.Integer,
    } group by Books.title`
    expected.SELECT.having = [ {func: 'search', args: [{ list: [{
      xpr: [
        { val: 'very' },
        '+',
        { val: 'useful' },
        '+',
        { val: 'string' }
      ] }] }, {val: 'x'}]}]
    expect(JSON.parse(JSON.stringify(cqn4sql(query, model)))).to.deep.equal(expected)
  })
})

describe('search w/ path expressions', () => {
  let model
  beforeAll(async () => {
    model = cds.model = cds.compile.for.nodejs(await cds.load(`${__dirname}/../bookshop/db/search`).then(cds.linked))
  })

  it('one string element with one search element', () => {
    let query = cds.ql`SELECT from search.BooksSearchAuthorName as BooksSearchAuthorName { ID, title }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.BooksSearchAuthorName as BooksSearchAuthorName left join search.Authors as author on author.ID = BooksSearchAuthorName.author_ID
    {
      BooksSearchAuthorName.ID,
      BooksSearchAuthorName.title
  }`
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ref: ['author', 'lastName']}]}, {val: 'x'}]}]
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('search all searchable fields in target', () => {
    let query = cds.ql`SELECT from search.BooksSearchAuthor as Books { ID, title }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.BooksSearchAuthor as Books left join search.Authors as author on author.ID = Books.author_ID
    {
      Books.ID,
      Books.title
  } where search((author.lastName, author.firstName), 'x')`
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('search only some searchable fields via multiple association paths', () => {
    let query = cds.ql`SELECT from search.BooksSearchAuthorAndAddress as Books { ID, title }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.BooksSearchAuthorAndAddress as Books
      left join search.AuthorsSearchAddresses as authorWithAddress on authorWithAddress.ID = Books.authorWithAddress_ID
      left join search.Addresses as address on address.ID = authorWithAddress.address_ID
    {
      Books.ID,
      Books.title
  } where search((authorWithAddress.note, address.city), 'x')`
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('dont dump for non existing search paths, but ignore the path', () => {
    let query = cds.ql`SELECT from search.BookShelf as BookShelf { ID, genre }`
    query.SELECT.search = [{ val: 'Harry Plotter' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.BookShelf as BookShelf
    {
      BookShelf.ID,
      BookShelf.genre
  }`
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ref: ['BookShelf', 'genre']}]}, {val: 'Harry Plotter'}]}]
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })
})

describe('calculated elements', () => {
  let model
  beforeAll(async () => {
    model = cds.model = cds.compile.for.nodejs(await cds.load(`${__dirname}/../bookshop/db/search`).then(cds.linked))
  })

  it('search calculated element via path expression', () => {
    let query = cds.ql`SELECT from search.AuthorsSearchCalculatedAddress as Authors { lastName }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.AuthorsSearchCalculatedAddress as Authors
        left join search.CalculatedAddresses as address on address.ID = Authors.address_ID
    {
      Authors.lastName
    } where search((Authors.note, (address.street || ' ' || address.zip || '' || address.city)), 'x')`
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })

  it('search calculated element only if explicitly requested', () => {
    let query = cds.ql`SELECT from search.CalculatedAddressesWithoutAnno as Address { Address.ID }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`SELECT from search.CalculatedAddressesWithoutAnno as Address { Address.ID }`
    expected.SELECT.where = [ {func: 'search', args: [{ list: [{ref: ['Address', 'city']}]}, {val: 'x'}]}]
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
  })
})

describe('caching searchable fields', () => {
  let model
  beforeAll(async () => {
    model = cds.model = cds.compile.for.nodejs(await cds.load(`${__dirname}/../bookshop/db/search`).then(cds.linked))
  })

  it('should cache searchable fields for entity', () => {
    let query = cds.ql`SELECT from search.BooksSearchAuthor as Books { ID, title }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.BooksSearchAuthor as Books left join search.Authors as author on author.ID = Books.author_ID
    {
      Books.ID,
      Books.title
  } where search((author.lastName, author.firstName), 'x')`

    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)
    // test caching
    expect(model.definitions['search.BooksSearchAuthor'])
      .to.have.property('__searchableColumns')
      .that.eqls([{ ref: ['author', 'lastName'] }, { ref: ['author', 'firstName'] }])

    let secondRun = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(secondRun))).to.deep.equal(expected)
  })

  // it is not required to set the searchable fields dynamically
  it.skip('should be possible to define new search criteria during runtime', () => {
    const { BooksSearchAuthor } = cds.entities
    let query = cds.ql`SELECT from search.BooksSearchAuthor as Books { ID, title }`
    query.SELECT.search = [{ val: 'x' }]

    let res = cqn4sql(query, model)
    const expected = cds.ql`
    SELECT from search.BooksSearchAuthor as Books left join search.Authors as author on author.ID = Books.author_ID
    {
      Books.ID,
      Books.title
    }`
    const where = [
      {
        func: 'search',
        args: [{ list: [{ ref: ['author', 'lastName'] }, { ref: ['author', 'firstName'] }] }, { val: 'x' }],
      },
    ]
    expected.SELECT.where = where
    expect(JSON.parse(JSON.stringify(res))).to.deep.equal(expected)

    // add another searchable field
    BooksSearchAuthor['@cds.search.title'] = true
    where[0].args[0].list.unshift({ ref: ['Books', 'title'] })

    let secondRun = cqn4sql(query, model)
    expect(JSON.parse(JSON.stringify(secondRun))).to.deep.equal(expected)
  })
})
