# Smart Shelf Testing Framework

This directory contains the testing framework for the Smart Shelf backend API. The tests are written using Jest and Supertest, with MongoDB Memory Server for testing database operations without affecting the production database.

## Setup

The testing environment is configured in `setup.js`, which:
- Creates an in-memory MongoDB server for tests
- Connects to the database before tests run
- Clears all collections after each test
- Disconnects and stops the server after all tests complete

## Test Structure

Tests are organized by API module:
- `auth.test.js` - Tests for user authentication APIs
- `products.test.js` - Tests for product management APIs
- `orders.test.js` - Tests for order processing APIs

Each test file follows a similar structure:
1. Import necessary modules
2. Set up a test Express app
3. Mock authentication middleware
4. Define test cases for each API endpoint

## Writing New Tests

When writing new tests, follow these guidelines:

1. **Test File Organization**:
   - Group tests by endpoint using `describe` blocks
   - Use descriptive test case names
   - Setup necessary data in `beforeEach` blocks

2. **Test Coverage**:
   - Test happy paths (expected user behavior)
   - Test edge cases and error conditions
   - Test authorization and permissions

3. **Mocking**:
   - Use Jest mocks for external services
   - Mock authentication middleware for protected routes
   - Reset mocks before each test

4. **Data Setup**:
   - Create test data in the setup section
   - Use unique identifiers to avoid collisions
   - Clean up data after tests

## Running Tests

Run all tests with:
```
npm test
```

Run tests in watch mode (for development):
```
npm run test:watch
```

## Test Coverage

To generate a coverage report:
```
npm test -- --coverage
```

## Best Practices

1. **Isolation**: Each test should be independent of others
2. **Meaningful Assertions**: Assert specific conditions rather than generic success
3. **Clear Error Messages**: Use custom error messages for better debugging
4. **Clean Setup and Teardown**: Ensure proper cleanup after tests
5. **Realistic Test Data**: Use data that closely resembles production scenarios

## Adding New Test Files

When adding tests for a new module:
1. Create a new file named `<module-name>.test.js`
2. Import the necessary modules and the test setup
3. Set up a test Express app with the routes
4. Mock any required dependencies
5. Define test cases for each endpoint 