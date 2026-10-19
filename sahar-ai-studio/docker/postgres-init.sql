-- Executed once when the postgres volume is first created.
-- Separate database for integration/e2e tests so they never touch development data.
CREATE DATABASE sahar_test OWNER sahar;
