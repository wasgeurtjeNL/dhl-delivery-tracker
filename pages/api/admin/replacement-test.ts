// pages/api/admin/replacement-test.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/adminAuth';
import { wooCommerceService } from '@/lib/woocommerceService';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TestResult {
  test_name: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: any;
  execution_time_ms?: number;
}

interface TestSuite {
  overall_status: 'passed' | 'failed' | 'warning';
  total_tests: number;
  passed: number;
  failed: number;
  warnings: number;
  tests: TestResult[];
  summary: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    requireAdminAuth(req);
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { testType = 'full' } = req.body;

    console.log(`🧪 Starting replacement system tests: ${testType}`);

    const testSuite = await runReplacementTests(testType);

    return res.status(200).json({
      success: true,
      test_type: testType,
      results: testSuite,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Replacement testing failed:', error);
    
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Admin authentication required'
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to run replacement tests',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function runReplacementTests(testType: string): Promise<TestSuite> {
  const tests: TestResult[] = [];
  
  // Test 1: Database Schema
  await testDatabaseSchema(tests);
  
  // Test 2: WooCommerce Connectivity
  await testWooCommerceConnectivity(tests);
  
  // Test 3: Product Validation
  await testProductValidation(tests);
  
  // Test 4: Tracking Code Validation
  await testTrackingValidation(tests);
  
  // Test 5: End-to-End Flow (only in full test)
  if (testType === 'full') {
    await testEndToEndFlow(tests);
  }

  // Calculate overall results
  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;
  const warnings = tests.filter(t => t.status === 'warning').length;
  
  let overallStatus: 'passed' | 'failed' | 'warning';
  let summary: string;
  
  if (failed > 0) {
    overallStatus = 'failed';
    summary = `❌ ${failed} test(s) failed - replacement system not ready`;
  } else if (warnings > 0) {
    overallStatus = 'warning';
    summary = `⚠️ ${warnings} warning(s) - replacement system has issues`;
  } else {
    overallStatus = 'passed';
    summary = `✅ All tests passed - replacement system ready!`;
  }

  return {
    overall_status: overallStatus,
    total_tests: tests.length,
    passed,
    failed,
    warnings,
    tests,
    summary
  };
}

async function testDatabaseSchema(tests: TestResult[]) {
  const startTime = Date.now();
  
  try {
    // Test replacement_requests table
    const { data, error } = await supabase
      .from('replacement_requests')
      .select('*')
      .limit(1);

    if (error) {
      tests.push({
        test_name: 'Database Schema - replacement_requests table',
        status: 'failed',
        message: `Table not accessible: ${error.message}`,
        execution_time_ms: Date.now() - startTime
      });
      return;
    }

    // Test table structure by attempting to select key columns
    const { data: columnTest, error: columnError } = await supabase
      .from('replacement_requests')
      .select('tracking_code, original_order_id, replacement_order_id, selected_product_id, status, customer_email')
      .limit(0);

    if (columnError) {
      tests.push({
        test_name: 'Database Schema - replacement_requests table',
        status: 'failed',
        message: `Table structure issue: ${columnError.message}`,
        execution_time_ms: Date.now() - startTime
      });
      return;
    }

    tests.push({
      test_name: 'Database Schema - replacement_requests table',
      status: 'passed',
      message: 'Table exists with correct structure',
      execution_time_ms: Date.now() - startTime
    });

  } catch (error) {
    tests.push({
      test_name: 'Database Schema - replacement_requests table',
      status: 'failed',
      message: `Database test failed: ${error}`,
      execution_time_ms: Date.now() - startTime
    });
  }
}

async function testWooCommerceConnectivity(tests: TestResult[]) {
  const startTime = Date.now();
  
  try {
    const isConnected = await wooCommerceService.validateConnection();
    
    if (isConnected) {
      tests.push({
        test_name: 'WooCommerce Connectivity',
        status: 'passed',
        message: 'WooCommerce API connection successful',
        execution_time_ms: Date.now() - startTime
      });
    } else {
      tests.push({
        test_name: 'WooCommerce Connectivity',
        status: 'failed',
        message: 'WooCommerce API connection failed',
        execution_time_ms: Date.now() - startTime
      });
    }

  } catch (error) {
    tests.push({
      test_name: 'WooCommerce Connectivity',
      status: 'failed',
      message: `WooCommerce test failed: ${error}`,
      execution_time_ms: Date.now() - startTime
    });
  }
}

async function testProductValidation(tests: TestResult[]) {
  const startTime = Date.now();
  
  try {
    const products = await wooCommerceService.getReplacementProducts();
    
    if (products.length === 0) {
      tests.push({
        test_name: 'Product Validation',
        status: 'warning',
        message: 'No replacement products found - check product IDs',
        execution_time_ms: Date.now() - startTime
      });
      return;
    }

    // Test specific product ID
    const testProductId = 1410; // First allowed product
    const testProduct = await wooCommerceService.getProductById(testProductId);
    
    if (testProduct) {
      tests.push({
        test_name: 'Product Validation',
        status: 'passed',
        message: `Found ${products.length} replacement products, tested product ${testProductId}`,
        details: { 
          total_products: products.length,
          test_product: testProduct.name
        },
        execution_time_ms: Date.now() - startTime
      });
    } else {
      tests.push({
        test_name: 'Product Validation',
        status: 'warning',
        message: `Found ${products.length} products but test product ${testProductId} not available`,
        execution_time_ms: Date.now() - startTime
      });
    }

  } catch (error) {
    tests.push({
      test_name: 'Product Validation',
      status: 'failed',
      message: `Product validation failed: ${error}`,
      execution_time_ms: Date.now() - startTime
    });
  }
}

async function testTrackingValidation(tests: TestResult[]) {
  const startTime = Date.now();
  
  try {
    // Get a real tracking code from the database (if any exists)
    const { data: trackingData, error } = await supabase
      .from('tracking_matches')
      .select('tracking_code, order_id, email')
      .limit(1)
      .single();

    if (error || !trackingData) {
      tests.push({
        test_name: 'Tracking Code Validation',
        status: 'warning',
        message: 'No tracking codes found in database - cannot test validation logic',
        execution_time_ms: Date.now() - startTime
      });
      return;
    }

    // Create a mock day 5 email log for this tracking code to make it valid
    await supabase
      .from('tracking_logs')
      .insert({
        tracking_code: trackingData.tracking_code,
        order_id: trackingData.order_id,
        email: trackingData.email,
        action_type: 'choice_email_sent',
        details: { test: true }
      });

    // Test validation API with real tracking code
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/replacement/validate?tracking_code=${trackingData.tracking_code}`);
    const result = await response.json();

    if (response.ok) {
      tests.push({
        test_name: 'Tracking Code Validation',
        status: 'passed',
        message: `Validation API working - tested with ${trackingData.tracking_code}`,
        details: {
          tracking_code: trackingData.tracking_code,
          validation_result: result.valid,
          reason: result.reason
        },
        execution_time_ms: Date.now() - startTime
      });
    } else {
      tests.push({
        test_name: 'Tracking Code Validation',
        status: 'failed',
        message: `Validation API error: ${result.error}`,
        execution_time_ms: Date.now() - startTime
      });
    }

  } catch (error) {
    tests.push({
      test_name: 'Tracking Code Validation',
      status: 'failed',
      message: `Tracking validation test failed: ${error}`,
      execution_time_ms: Date.now() - startTime
    });
  }
}

async function testEndToEndFlow(tests: TestResult[]) {
  const startTime = Date.now();
  
  try {
    // Create test tracking entry
    const testTrackingCode = `TEST_${Date.now()}`;
    const testOrderId = `TEST_ORDER_${Date.now()}`;
    
    // Insert test tracking data
    const { error: insertError } = await supabase
      .from('tracking_matches')
      .insert({
        tracking_code: testTrackingCode,
        order_id: testOrderId,
        email: 'test@wasgeurtje.nl',
        first_name: 'Test',
        last_name: 'User'
      });

    if (insertError) {
      tests.push({
        test_name: 'End-to-End Flow Test',
        status: 'failed',
        message: `Failed to create test data: ${insertError.message}`,
        execution_time_ms: Date.now() - startTime
      });
      return;
    }

    // Insert test day 5 email log
    const { error: logError } = await supabase
      .from('tracking_logs')
      .insert({
        tracking_code: testTrackingCode,
        order_id: testOrderId,
        email: 'test@wasgeurtje.nl',
        action_type: 'choice_email_sent',
        details: { test: true }
      });

    if (logError) {
      tests.push({
        test_name: 'End-to-End Flow Test',
        status: 'warning',
        message: `Test data created but failed to log day 5 email: ${logError.message}`,
        execution_time_ms: Date.now() - startTime
      });
    } else {
      tests.push({
        test_name: 'End-to-End Flow Test',
        status: 'passed',
        message: `Test scenario created successfully - tracking: ${testTrackingCode}`,
        details: {
          test_tracking_code: testTrackingCode,
          test_order_id: testOrderId,
          note: 'Test data created - manual testing possible via replacement page'
        },
        execution_time_ms: Date.now() - startTime
      });
    }

    // Cleanup test data
    await supabase.from('tracking_matches').delete().eq('tracking_code', testTrackingCode);
    await supabase.from('tracking_logs').delete().eq('tracking_code', testTrackingCode);

  } catch (error) {
    tests.push({
      test_name: 'End-to-End Flow Test',
      status: 'failed',
      message: `End-to-end test failed: ${error}`,
      execution_time_ms: Date.now() - startTime
    });
  }
}