public with sharing class EmployeeController {

    /**
     * Fetch all Employee__c records ordered by Employee ID.
     */
    @AuraEnabled(cacheable=true)
    public static List<Employee__c> getEmployees() {
        return [
            SELECT  Id,
                    Name,
                    Employee_ID__c,
                    Department__c,
                    Email__c,
                    Joining_Date__c,
                    Salary__c
            FROM    Employee__c
            ORDER BY Employee_ID__c ASC
            LIMIT   500
        ];
    }

    /**
     * Upsert a single Employee__c record.
     * Pass a record with Id populated to update; without Id to insert.
     */
    @AuraEnabled
    public static Employee__c saveEmployee(Employee__c employee) {
        try {
            upsert employee;
            return employee;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    /**
     * Delete an Employee__c record by Id.
     */
    @AuraEnabled
    public static void deleteEmployee(Id recordId) {
        try {
            delete [SELECT Id FROM Employee__c WHERE Id = :recordId LIMIT 1];
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}