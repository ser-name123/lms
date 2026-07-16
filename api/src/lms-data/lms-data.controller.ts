import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LmsDataService } from './lms-data.service';
import { Public } from '../auth/decorators';

@ApiTags('lms-data')
@Controller('lms-data')
@Public()
export class LmsDataController {
  constructor(private readonly service: LmsDataService) {}

  // Courses
  @Get('courses')
  @ApiOperation({ summary: 'Get all courses' })
  getCourses() {
    return this.service.getCourses();
  }

  @Post('courses')
  @ApiOperation({ summary: 'Create a course' })
  createCourse(@Body() dto: any) {
    return this.service.createCourse(dto);
  }

  @Put('courses/:id')
  @ApiOperation({ summary: 'Update a course' })
  updateCourse(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a course' })
  deleteCourse(@Param('id') id: string) {
    return this.service.deleteCourse(id);
  }

  // Assignments
  @Get('assignments')
  @ApiOperation({ summary: 'Get all assignments' })
  getAssignments() {
    return this.service.getAssignments();
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Create an assignment' })
  createAssignment(@Body() dto: any) {
    return this.service.createAssignment(dto);
  }

  @Put('assignments/:id')
  @ApiOperation({ summary: 'Update an assignment' })
  updateAssignment(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateAssignment(id, dto);
  }

  @Delete('assignments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an assignment' })
  deleteAssignment(@Param('id') id: string) {
    return this.service.deleteAssignment(id);
  }

  // Assessments
  @Get('assessments')
  @ApiOperation({ summary: 'Get all assessments' })
  getAssessments() {
    return this.service.getAssessments();
  }

  @Post('assessments')
  @ApiOperation({ summary: 'Create an assessment' })
  createAssessment(@Body() dto: any) {
    return this.service.createAssessment(dto);
  }

  @Put('assessments/:id')
  @ApiOperation({ summary: 'Update an assessment' })
  updateAssessment(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateAssessment(id, dto);
  }

  @Delete('assessments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an assessment' })
  deleteAssessment(@Param('id') id: string) {
    return this.service.deleteAssessment(id);
  }

  // Knowledgebase
  @Get('knowledgebase')
  @ApiOperation({ summary: 'Get all knowledgebase items' })
  getKnowledgebase() {
    return this.service.getKnowledgebase();
  }

  @Post('knowledgebase')
  @ApiOperation({ summary: 'Create a knowledgebase item' })
  createKnowledgebase(@Body() dto: any) {
    return this.service.createKnowledgebase(dto);
  }

  @Put('knowledgebase/:id')
  @ApiOperation({ summary: 'Update a knowledgebase item' })
  updateKnowledgebase(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateKnowledgebase(id, dto);
  }

  @Delete('knowledgebase/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledgebase item' })
  deleteKnowledgebase(@Param('id') id: string) {
    return this.service.deleteKnowledgebase(id);
  }

  // Packages
  @Get('packages')
  @ApiOperation({ summary: 'Get all packages' })
  getPackages() {
    return this.service.getPackages();
  }

  @Post('packages')
  @ApiOperation({ summary: 'Create a package' })
  createPackage(@Body() dto: any) {
    return this.service.createPackage(dto);
  }

  @Put('packages/:id')
  @ApiOperation({ summary: 'Update a package' })
  updatePackage(@Param('id') id: string, @Body() dto: any) {
    return this.service.updatePackage(id, dto);
  }

  @Delete('packages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a package' })
  deletePackage(@Param('id') id: string) {
    return this.service.deletePackage(id);
  }
}
